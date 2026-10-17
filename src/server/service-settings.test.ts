import { describe, expect, it } from "vitest";

import type { DbClient, Json, Service } from "@/db/types";

import {
  ServiceSettingsError,
  type ServiceWrite,
  createService,
  deleteService,
  updateService,
} from "./service-settings";

/**
 * `services` and `audit_logs`, faked.
 *
 * Not a mock of the query builder: two small tables with the behaviours that
 * matter here. `services` enforces the unique name on both insert and update,
 * updates replace rather than mutate (so a `before` snapshot stays valid, as it
 * does against the real client), and every write lands in `audit_logs`.
 */

type AuditRow = {
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  before: Json | null;
  after: Json | null;
};

const SERVICE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const UNKNOWN_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const CREATED_AT = "2026-01-01T00:00:00.000Z";

function makeService(overrides: Partial<Service> = {}): Service {
  return {
    id: SERVICE_ID,
    name: "Dry Cleaning",
    description: "Specialist dry cleaning for delicate fabrics",
    unit: "piece",
    price: 250,
    image_url: null,
    is_active: true,
    sort_order: 3,
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
    ...overrides,
  };
}

function write(overrides: Partial<ServiceWrite> = {}): ServiceWrite {
  return {
    name: "Curtain Cleaning",
    description: "Steam cleaned and dust free",
    unit: "kg",
    price: 120,
    imageUrl: null,
    isActive: true,
    sortOrder: 5,
    ...overrides,
  };
}

function makeClient(seed?: { services?: Service[] }) {
  const services = (seed?.services ?? [makeService()]).map((s) => ({ ...s }));
  const audits: AuditRow[] = [];

  function table(name: string) {
    let operation: "select" | "update" | "insert" | "delete" = "select";
    let patch: Record<string, unknown> = {};
    let inserted: Record<string, unknown> = {};
    let filterId: unknown = null;

    const uniqueViolation = {
      code: "23505",
      message:
        'duplicate key value violates unique constraint "services_name_unique"',
    };

    async function run(): Promise<{
      data: unknown;
      error: { message: string; code?: string } | null;
    }> {
      if (name === "audit_logs") {
        if (operation === "insert") audits.push(inserted as AuditRow);
        return { data: null, error: null };
      }

      if (name === "services") {
        if (operation === "select") {
          const row = services.find((service) => service.id === filterId);
          return { data: row ? { ...row } : null, error: null };
        }

        if (operation === "insert") {
          if (services.some((service) => service.name === inserted.name)) {
            return { data: null, error: uniqueViolation };
          }

          const row = {
            id: `service-${services.length + 1}`,
            created_at: CREATED_AT,
            updated_at: CREATED_AT,
            ...inserted,
          } as Service;
          services.push(row);
          return { data: { ...row }, error: null };
        }

        if (operation === "update") {
          const index = services.findIndex((service) => service.id === filterId);
          if (index < 0) return { data: null, error: null };

          const clash = services.some(
            (service, at) => at !== index && service.name === patch.name,
          );
          if (clash) return { data: null, error: uniqueViolation };

          const next = { ...services[index], ...patch } as Service;
          services[index] = next;
          return { data: { ...next }, error: null };
        }

        const index = services.findIndex((service) => service.id === filterId);
        if (index >= 0) services.splice(index, 1);
        return { data: null, error: null };
      }

      return { data: null, error: null };
    }

    const api = {
      select: () => api,
      update: (values: Record<string, unknown>) => {
        operation = "update";
        patch = values;
        return api;
      },
      insert: (values: Record<string, unknown>) => {
        operation = "insert";
        inserted = values;
        return api;
      },
      delete: () => {
        operation = "delete";
        return api;
      },
      eq: (column: string, value: unknown) => {
        filterId = value;
        return api;
      },
      async maybeSingle() {
        const { data, error } = await run();
        const row = Array.isArray(data) ? (data[0] ?? null) : data;
        return { data: row, error };
      },
      then: (resolve: (value: unknown) => unknown) => run().then(resolve),
    };

    return api;
  }

  return {
    client: { from: (name: string) => table(name) } as unknown as DbClient,
    audits,
    services,
  };
}

describe("createService", () => {
  it("inserts the row and audits the creation with no before", async () => {
    const { client, audits, services } = makeClient();

    const saved = await createService(client, "admin-1", write());

    expect(saved.name).toBe("Curtain Cleaning");
    expect(services).toHaveLength(2);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actor_id: "admin-1",
      action: "services.created",
      entity: "services",
      entity_id: saved.id,
      before: null,
    });
    expect(audits[0]?.after).toMatchObject({ name: "Curtain Cleaning", price: 120 });
  });

  it("turns the unique-name violation into a readable error", async () => {
    const { client, audits, services } = makeClient();

    await expect(
      createService(client, "admin-1", write({ name: "Dry Cleaning" })),
    ).rejects.toBeInstanceOf(ServiceSettingsError);

    expect(services).toHaveLength(1);
    expect(audits).toHaveLength(0);
  });
});

describe("updateService", () => {
  it("writes the change and audits a real before and after", async () => {
    const { client, audits, services } = makeClient();

    const saved = await updateService(client, "admin-1", SERVICE_ID, {
      ...write(),
      name: "Dry Cleaning",
      price: 199,
      isActive: false,
    });

    expect(saved.price).toBe(199);
    expect(services[0]).toMatchObject({ price: 199, is_active: false });
    expect(audits[0]).toMatchObject({
      action: "services.updated",
      entity_id: SERVICE_ID,
    });
    expect(audits[0]?.before).toMatchObject({ price: 250, is_active: true });
    expect(audits[0]?.after).toMatchObject({ price: 199, is_active: false });
  });

  it("refuses to rename onto another service's name", async () => {
    const { client, audits } = makeClient({
      services: [makeService(), makeService({ id: UNKNOWN_ID, name: "Wash and Iron" })],
    });

    await expect(
      updateService(client, "admin-1", SERVICE_ID, write({ name: "Wash and Iron" })),
    ).rejects.toBeInstanceOf(ServiceSettingsError);

    expect(audits).toHaveLength(0);
  });

  it("throws, and audits nothing, when the service does not exist", async () => {
    const { client, audits } = makeClient();

    await expect(
      updateService(client, "admin-1", UNKNOWN_ID, write()),
    ).rejects.toBeInstanceOf(ServiceSettingsError);

    expect(audits).toHaveLength(0);
  });
});

describe("deleteService", () => {
  it("removes the row and audits what was removed", async () => {
    const { client, audits, services } = makeClient();

    await deleteService(client, "admin-1", SERVICE_ID);

    expect(services).toHaveLength(0);
    expect(audits[0]).toMatchObject({
      action: "services.deleted",
      entity: "services",
      entity_id: SERVICE_ID,
      after: null,
    });
    expect(audits[0]?.before).toMatchObject({ name: "Dry Cleaning" });
  });

  it("refuses, quietly, to delete a service that is not there", async () => {
    const { client, audits } = makeClient();

    await expect(
      deleteService(client, "admin-1", UNKNOWN_ID),
    ).rejects.toBeInstanceOf(ServiceSettingsError);

    expect(audits).toHaveLength(0);
  });
});
