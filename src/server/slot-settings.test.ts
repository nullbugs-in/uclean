import { describe, expect, it } from "vitest";

import type { BlockedDate, DbClient, Json, TimeSlot } from "@/db/types";

import {
  SlotSettingsError,
  addBlockedDate,
  removeBlockedDate,
  updateTimeSlots,
} from "./slot-settings";

/**
 * `time_slots`, `blocked_dates` and `audit_logs`, faked.
 *
 * Not a mock of the query builder: three small tables with the behaviours that
 * actually matter here. `time_slots` keeps the columns it was not given,
 * `blocked_dates` is keyed by date and rejects a duplicate, and every write
 * lands in `audit_logs`. Modelling those means a test fails if the code starts
 * overwriting a window it did not mean to, or stops auditing a change -- the
 * mistakes that would otherwise only show up in production.
 */

type AuditRow = {
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  before: Json | null;
  after: Json | null;
};

const SLOT_ID = "11111111-1111-1111-1111-111111111111";
const UNKNOWN_ID = "22222222-2222-2222-2222-222222222222";
const CREATED_AT = "2026-01-01T00:00:00.000Z";

function makeSlot(overrides: Partial<TimeSlot> = {}): TimeSlot {
  return {
    id: SLOT_ID,
    start_time: "10:00:00",
    end_time: "11:00:00",
    label: "10 AM - 11 AM",
    capacity: 9,
    is_active: true,
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
    ...overrides,
  };
}

function makeClient(seed?: { slots?: TimeSlot[]; blocked?: BlockedDate[] }) {
  const slots = (seed?.slots ?? [makeSlot()]).map((slot) => ({ ...slot }));
  const blocked = (seed?.blocked ?? []).map((entry) => ({ ...entry }));
  const audits: AuditRow[] = [];

  function table(name: string) {
    let operation: "select" | "update" | "insert" | "delete" = "select";
    let patch: Partial<TimeSlot> = {};
    let inserted: Record<string, unknown> = {};
    let filter: { column: string; value: unknown } | null = null;
    let inFilter: { column: string; values: unknown[] } | null = null;

    async function run(): Promise<{
      data: unknown;
      error: { message: string; code?: string } | null;
    }> {
      if (name === "audit_logs") {
        if (operation === "insert") audits.push(inserted as AuditRow);
        return { data: null, error: null };
      }

      if (name === "time_slots") {
        if (operation === "select") {
          const ids = inFilter?.values;
          const rows = ids
            ? slots.filter((slot) => ids.includes(slot.id))
            : slots;
          return { data: rows, error: null };
        }

        // A replacement rather than a mutation, matching the real client: each
        // query hands back a freshly deserialized object, so a snapshot taken by
        // an earlier select does not change under the code's feet.
        const index = slots.findIndex((slot) => slot.id === filter?.value);
        if (index < 0) return { data: null, error: null };
        const next = { ...slots[index], ...patch } as TimeSlot;
        slots[index] = next;
        return { data: { ...next }, error: null };
      }

      if (name === "blocked_dates") {
        if (operation === "select") {
          const row = blocked.find((entry) => entry.date === filter?.value);
          return { data: row ? { ...row } : null, error: null };
        }

        if (operation === "insert") {
          const date = String(inserted.date);

          if (blocked.some((entry) => entry.date === date)) {
            return {
              data: null,
              error: {
                code: "23505",
                message:
                  'duplicate key value violates unique constraint "blocked_dates_pkey"',
              },
            };
          }

          const row: BlockedDate = {
            date,
            reason: (inserted.reason as string | null) ?? null,
            created_at: CREATED_AT,
          };
          blocked.push(row);
          return { data: { ...row }, error: null };
        }

        // delete
        const index = blocked.findIndex(
          (entry) => entry.date === filter?.value,
        );
        if (index >= 0) blocked.splice(index, 1);
        return { data: null, error: null };
      }

      return { data: null, error: null };
    }

    // A thenable rather than a chain of promises, so both `await ...select().in()`
    // and the `...select().maybeSingle()` shape read the same way they do against
    // the real client.
    const api = {
      select: () => api,
      update: (values: Partial<TimeSlot>) => {
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
        filter = { column, value };
        return api;
      },
      in: (column: string, values: unknown[]) => {
        inFilter = { column, values };
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
    slots,
    blocked,
  };
}

describe("updateTimeSlots", () => {
  it("writes a changed capacity and returns the changed row", async () => {
    const { client, slots } = makeClient();

    const changed = await updateTimeSlots(client, "admin-1", [
      { id: SLOT_ID, capacity: 12, label: "10 AM - 11 AM", isActive: true },
    ]);

    expect(changed).toHaveLength(1);
    expect(slots[0]?.capacity).toBe(12);
  });

  it("leaves the columns it was not given alone", async () => {
    const { client, slots } = makeClient();

    await updateTimeSlots(client, "admin-1", [
      { id: SLOT_ID, capacity: 4, label: null, isActive: false },
    ]);

    // The window is not editable from this form, so it must survive untouched.
    expect(slots[0]).toMatchObject({
      start_time: "10:00:00",
      end_time: "11:00:00",
      capacity: 4,
      label: null,
      is_active: false,
    });
  });

  it("writes nothing, and audits nothing, when a slot is unchanged", async () => {
    const { client, audits, slots } = makeClient();

    const changed = await updateTimeSlots(client, "admin-1", [
      { id: SLOT_ID, capacity: 9, label: "10 AM - 11 AM", isActive: true },
    ]);

    expect(changed).toHaveLength(0);
    expect(audits).toHaveLength(0);
    expect(slots[0]?.updated_at).toBe(CREATED_AT);
  });

  it("records who changed what, with a real before and after", async () => {
    const { client, audits } = makeClient();

    await updateTimeSlots(client, "admin-1", [
      { id: SLOT_ID, capacity: 3, label: "10 AM - 11 AM", isActive: true },
    ]);

    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actor_id: "admin-1",
      action: "time_slots.updated",
      entity: "time_slots",
      entity_id: SLOT_ID,
    });
    expect(audits[0]?.before).toMatchObject({ capacity: 9 });
    expect(audits[0]?.after).toMatchObject({ capacity: 3 });
  });

  it("throws, and audits nothing, when a slot id does not exist", async () => {
    const { client, audits } = makeClient();

    await expect(
      updateTimeSlots(client, "admin-1", [
        { id: UNKNOWN_ID, capacity: 3, label: null, isActive: true },
      ]),
    ).rejects.toBeInstanceOf(SlotSettingsError);

    expect(audits).toHaveLength(0);
  });
});

describe("addBlockedDate", () => {
  it("inserts the date and audits the addition", async () => {
    const { client, blocked, audits } = makeClient();

    const saved = await addBlockedDate(client, "admin-1", {
      date: "2026-10-20",
      reason: "Diwali",
    });

    expect(saved.date).toBe("2026-10-20");
    expect(blocked.map((entry) => entry.date)).toContain("2026-10-20");
    expect(audits[0]).toMatchObject({
      action: "blocked_dates.added",
      entity: "blocked_dates",
      entity_id: "2026-10-20",
      before: null,
      after: { date: "2026-10-20", reason: "Diwali" },
    });
  });

  it("reports a duplicate as a friendly error rather than a raw constraint", async () => {
    const { client, audits } = makeClient({
      blocked: [{ date: "2026-10-20", reason: null, created_at: CREATED_AT }],
    });

    await expect(
      addBlockedDate(client, "admin-1", { date: "2026-10-20", reason: null }),
    ).rejects.toBeInstanceOf(SlotSettingsError);

    expect(audits).toHaveLength(0);
  });
});

describe("removeBlockedDate", () => {
  it("deletes the date and audits what was removed", async () => {
    const { client, blocked, audits } = makeClient({
      blocked: [
        { date: "2026-10-20", reason: "Diwali", created_at: CREATED_AT },
      ],
    });

    await removeBlockedDate(client, "admin-1", "2026-10-20");

    expect(blocked).toHaveLength(0);
    expect(audits[0]).toMatchObject({
      action: "blocked_dates.removed",
      before: { date: "2026-10-20", reason: "Diwali" },
      after: null,
    });
  });

  it("refuses, quietly, to remove a date that is not blocked", async () => {
    const { client, audits } = makeClient();

    await expect(
      removeBlockedDate(client, "admin-1", "2026-10-20"),
    ).rejects.toBeInstanceOf(SlotSettingsError);

    expect(audits).toHaveLength(0);
  });
});
