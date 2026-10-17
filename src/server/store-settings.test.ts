import { describe, expect, it } from "vitest";

import type { DbClient, Json, StoreSettings } from "@/db/types";

import {
  StoreSettingsError,
  updateBookingRules,
  updateStoreSettings,
} from "./store-settings";

/**
 * `store_settings` and `audit_logs`, faked.
 *
 * Not a mock of the query builder: a one-row table with the two behaviours that
 * actually matter. `store_settings` is a singleton (id = true), and an update is
 * read-modify-write. Modelling both means a test fails if the code starts
 * treating the row as a collection, or forgets to carry the old values into the
 * audit trail -- the change that would otherwise only be noticed in production.
 */

type AuditRow = {
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  before: Json | null;
  after: Json | null;
};

type Builder = {
  select: () => Builder;
  update: (values: Partial<StoreSettings>) => Builder;
  eq: (column: string, value: unknown) => Builder;
  maybeSingle: () => Promise<{
    data: StoreSettings | null;
    error: { message: string } | null;
  }>;
  insert: (values: AuditRow) => Promise<{
    data: null;
    error: { message: string } | null;
  }>;
};

function makeStore(overrides: Partial<StoreSettings> = {}): StoreSettings {
  return {
    id: true,
    lat: null,
    lng: null,
    address: null,
    phone: null,
    whatsapp_number: null,
    max_radius_km: 6,
    booking_cutoff_minutes: 60,
    opening_time: "10:00:00",
    closing_time: "19:00:00",
    break_start: "14:00:00",
    break_end: "15:00:00",
    gstin: null,
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function fakeClient(initial: StoreSettings | null) {
  let row = initial ? { ...initial } : null;
  const audits: AuditRow[] = [];

  function table(name: string): Builder {
    let operation: "select" | "update" = "select";
    let patch: Partial<StoreSettings> = {};

    const api: Builder = {
      select: () => api,
      update: (values) => {
        operation = "update";
        patch = values;
        return api;
      },
      eq: () => api,
      async maybeSingle() {
        if (operation === "update") {
          if (!row) return { data: null, error: null };
          row = { ...row, ...patch };
          return { data: row, error: null };
        }
        return { data: row, error: null };
      },
      async insert(values) {
        if (name === "audit_logs") audits.push(values);
        return { data: null, error: null };
      },
    };

    return api;
  }

  return {
    client: { from: (name: string) => table(name) } as unknown as DbClient,
    audits,
    getRow: () => row,
  };
}

const UPDATE = {
  lat: 12.3248091,
  lng: 76.6288967,
  maxRadiusKm: 6,
  address: "Shop 1, Main Rd",
  whatsappNumber: "918073974160",
  gstin: null,
};

describe("updateStoreSettings", () => {
  it("writes the coordinates and returns the saved row", async () => {
    const { client, getRow } = fakeClient(makeStore());

    const saved = await updateStoreSettings(client, "admin-1", UPDATE);

    expect(saved.lat).toBe(12.3248091);
    expect(saved.lng).toBe(76.6288967);
    expect(saved.max_radius_km).toBe(6);
    expect(saved.address).toBe("Shop 1, Main Rd");
    expect(getRow()?.lat).toBe(12.3248091);
  });

  it("records who changed what, with a real before and after", async () => {
    const { client, audits } = fakeClient(makeStore({ max_radius_km: 6 }));

    await updateStoreSettings(client, "admin-1", { ...UPDATE, maxRadiusKm: 8 });

    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actor_id: "admin-1",
      action: "store_settings.updated",
      entity: "store_settings",
      entity_id: "true",
    });
    // Before: the seed state. After: what the admin just saved.
    expect(audits[0]?.before).toMatchObject({ lat: null, max_radius_km: 6 });
    expect(audits[0]?.after).toMatchObject({
      lat: 12.3248091,
      max_radius_km: 8,
    });
  });

  it("clears the coordinates when passed null", async () => {
    const { client, getRow, audits } = fakeClient(
      makeStore({ lat: 12.3248091, lng: 76.6288967 }),
    );

    const saved = await updateStoreSettings(client, "admin-1", {
      ...UPDATE,
      lat: null,
      lng: null,
    });

    expect(saved.lat).toBeNull();
    expect(getRow()?.lng).toBeNull();
    expect(audits[0]?.before).toMatchObject({ lat: 12.3248091 });
    expect(audits[0]?.after).toMatchObject({ lat: null });
  });

  it("refuses to write, and stays quiet, when the settings row is missing", async () => {
    const { client, audits } = fakeClient(null);

    await expect(
      updateStoreSettings(client, "admin-1", UPDATE),
    ).rejects.toBeInstanceOf(StoreSettingsError);

    // No dangling audit row for a change that never happened.
    expect(audits).toHaveLength(0);
  });
});

describe("updateBookingRules", () => {
  it("writes the cut-off and returns the saved row", async () => {
    const { client, getRow } = fakeClient(makeStore());

    const saved = await updateBookingRules(client, "admin-1", {
      cutoffMinutes: 90,
    });

    expect(saved.booking_cutoff_minutes).toBe(90);
    expect(getRow()?.booking_cutoff_minutes).toBe(90);
  });

  it("leaves the other columns alone, and audits only its own field", async () => {
    // The two writers share one row. A patch that carried the whole record would
    // make saving the cut-off silently reset the coordinates the Settings page
    // had just set, which is the failure this pins.
    const { client, getRow, audits } = fakeClient(
      makeStore({ lat: 12.3248091, lng: 76.6288967, max_radius_km: 6 }),
    );

    await updateBookingRules(client, "admin-1", { cutoffMinutes: 0 });

    expect(getRow()?.lat).toBe(12.3248091);
    expect(getRow()?.lng).toBe(76.6288967);
    expect(getRow()?.max_radius_km).toBe(6);

    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actor_id: "admin-1",
      action: "store_settings.booking_rules_updated",
      entity: "store_settings",
      entity_id: "true",
      before: { booking_cutoff_minutes: 60 },
      after: { booking_cutoff_minutes: 0 },
    });

    // Only the cut-off, so a reviewer is not told the radius changed too.
    expect(Object.keys(audits[0]?.after ?? {})).toEqual([
      "booking_cutoff_minutes",
    ]);
  });

  it("accepts 0, which means up to the minute", async () => {
    const { client } = fakeClient(makeStore({ booking_cutoff_minutes: 60 }));

    const saved = await updateBookingRules(client, "admin-1", {
      cutoffMinutes: 0,
    });

    expect(saved.booking_cutoff_minutes).toBe(0);
  });

  it("refuses to write, and stays quiet, when the settings row is missing", async () => {
    const { client, audits } = fakeClient(null);

    await expect(
      updateBookingRules(client, "admin-1", { cutoffMinutes: 30 }),
    ).rejects.toBeInstanceOf(StoreSettingsError);

    expect(audits).toHaveLength(0);
  });
});
