import { beforeEach, describe, expect, it } from "vitest";

import type { Address, DbClient } from "@/db/types";

import {
  AddressError,
  deleteAddress,
  getPrefillAddress,
  saveDefaultAddress,
  setDefaultAddress,
  updateAddress,
} from "./addresses";

/**
 * The addresses table, faked.
 *
 * This is not a mock of the query builder. It is a small in-memory table with the
 * two behaviours that actually matter and that the real schema guarantees: a row
 * belongs to one user, and a user may have at most one default. Modelling those
 * means a test fails if the code starts writing a second default, which is the
 * bug the partial unique index would otherwise only catch in production.
 */

type Row = Address;

let rows: Row[];
let nextId: number;
/** Every write issued, so a test can assert on ordering. */
let writes: string[];

const USER = "user-1";
const OTHER = "user-2";

function makeRow(overrides: Partial<Row> = {}): Row {
  return {
    id: `a${nextId++}`,
    user_id: USER,
    label: "Pickup address",
    address_text: "2979/1, D21/1, 6th Main Rd",
    lat: 12.9,
    lng: 77.6,
    distance_km: null,
    is_default: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

/**
 * A chainable stand-in that resolves every filter against the in-memory table.
 *
 * The real Supabase builder returns a fresh object per method; this returns the
 * same object throughout so a filter set in any order accumulates, which keeps
 * the fake short without having to mirror the builder's exact shape.
 */
function fakeClient(): DbClient {
  /**
   * A fresh builder per `.from()` call, because the real one starts with no
   * filters and every `.eq()` accumulates onto this statement alone.
   */
  function makeBuilder(): Record<string, unknown> {
    const filters: Record<string, unknown> = {};
    let op: "select" | "insert" | "update" | "delete" = "select";
    let patch: Record<string, unknown> = {};
    let inserted: Record<string, unknown> | null = null;

    const matches = (row: Row) =>
      Object.entries(filters).every(
        ([column, value]) => `${row[column as keyof Row]}` === `${value}`,
      );

    const builder: Record<string, unknown> = {
      // `.select()` deliberately does not reset the operation: in Supabase,
      // `.update(...).eq(...).select(...)` is an update that returns the row, and
      // resetting here would turn it into a read.
      select: () => builder,
      insert: (values: Record<string, unknown>) => {
        op = "insert";
        inserted = values;
        return builder;
      },
      update: (values: Record<string, unknown>) => {
        op = "update";
        patch = values;
        return builder;
      },
      delete: () => {
        op = "delete";
        return builder;
      },
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        return builder;
      },

      order: () => builder,

      async single() {
        const found = rows.filter(matches)[0];

        if (op === "insert") {
          const created = makeRow(inserted as Partial<Row>);

          // Mirrors the partial unique index: one default per user, not
          // deferrable, so a second one is rejected outright.
          if (created.is_default) {
            for (const row of rows) {
              if (row.user_id === created.user_id && row.is_default) {
                throw new Error(
                  "duplicate key violates addresses_one_default_per_user",
                );
              }
            }
          }

          rows.push(created);
          writes.push("insert");
          return { data: created, error: null };
        }

        if (!found) throw new Error("no rows returned");

        if (op === "update") {
          Object.assign(found, patch);
          writes.push("update");
        }

        return { data: found, error: null };
      },

      async maybeSingle() {
        const found = rows.filter(matches)[0];

        if (op === "update") {
          if (!found) return { data: null, error: null };
          Object.assign(found, patch);
          writes.push("update");
          return { data: found, error: null };
        }

        if (op === "delete") {
          if (!found) return { data: null, error: null };
          rows = rows.filter((row) => row.id !== found.id);
          writes.push("delete");
          return { data: found, error: null };
        }

        return { data: found ?? null, error: null };
      },

      /**
       * Terminal for both the list read and a write that did not ask for rows
       * back. Supabase executes an update or delete on await; only when
       * `.select()` is chained does it return the affected row instead.
       */
      then: (resolve: (value: { data: Row[]; error: null }) => unknown) => {
        const found = rows.filter(matches);

        if (op === "update") {
          for (const row of found) {
            Object.assign(row, patch);
            writes.push("update");
          }
          return resolve({ data: [], error: null });
        }

        if (op === "delete") {
          rows = rows.filter((row) => !found.includes(row));
          writes.push("delete");
          return resolve({ data: [], error: null });
        }

        return resolve({
          data: found.sort(
            (a, b) =>
              Number(b.is_default) - Number(a.is_default) ||
              b.created_at.localeCompare(a.created_at),
          ),
          error: null,
        });
      },
    };

    return builder;
  }

  return { from: () => makeBuilder() } as unknown as DbClient;
}

function client(): DbClient {
  return fakeClient();
}

beforeEach(() => {
  rows = [];
  nextId = 1;
  writes = [];
});

describe("saveDefaultAddress", () => {
  it("stores the address as the default on a first booking", async () => {
    const saved = await saveDefaultAddress(client(), USER, {
      addressText: "2979/1, D21/1, 6th Main Rd",
      lat: 12.9,
      lng: 77.6,
    });

    expect(saved.is_default).toBe(true);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.address_text).toBe("2979/1, D21/1, 6th Main Rd");
  });

  it("trims what it stores", async () => {
    await saveDefaultAddress(client(), USER, {
      addressText: "  2979/1, D21/1, 6th Main Rd  ",
      lat: 12.9,
      lng: 77.6,
    });

    expect(rows[0]?.address_text).toBe("2979/1, D21/1, 6th Main Rd");
  });

  it("refuses an address too short to be worth collecting from", async () => {
    await expect(
      saveDefaultAddress(client(), USER, {
        addressText: "short",
        lat: 12.9,
        lng: 77.6,
      }),
    ).rejects.toBeInstanceOf(AddressError);

    expect(rows).toHaveLength(0);
  });

  /**
   * The behaviour the old exact-string comparison got wrong. Booking from the
   * same flat twice with different capitalisation used to leave two rows and two
   * competing prefills.
   */
  it("reuses an equivalent address instead of duplicating it", async () => {
    const db = client();

    await saveDefaultAddress(db, USER, {
      addressText: "Flat 2, Main Road",
      lat: 12.9,
      lng: 77.6,
    });

    await saveDefaultAddress(db, USER, {
      addressText: "  flat 2,   main road, ",
      lat: 12.9,
      lng: 77.6,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.address_text).toBe("Flat 2, Main Road");
  });

  it("keeps genuinely different addresses as separate rows", async () => {
    const db = client();

    await saveDefaultAddress(db, USER, {
      addressText: "Flat 2, Main Road",
      lat: 12.9,
      lng: 77.6,
    });

    await saveDefaultAddress(db, USER, {
      addressText: "Flat 3, Main Road",
      lat: 12.9,
      lng: 77.6,
    });

    expect(rows).toHaveLength(2);
  });

  /**
   * The partial unique index is not deferrable, so a second default row would be
   * rejected outright. That is why the existing default is cleared first, and
   * this is the test that would notice if that step were ever dropped.
   */
  it("never leaves two defaults for one customer", async () => {
    const db = client();

    await saveDefaultAddress(db, USER, {
      addressText: "Flat 2, Main Road",
      lat: 12.9,
      lng: 77.6,
    });

    await saveDefaultAddress(db, USER, {
      addressText: "Flat 3, Main Road",
      lat: 12.9,
      lng: 77.6,
    });

    const defaults = rows.filter((row) => row.is_default);
    expect(defaults).toHaveLength(1);
    expect(defaults[0]?.address_text).toBe("Flat 3, Main Road");
  });

  it("does not touch another customer's addresses", async () => {
    const db = client();
    rows.push(
      makeRow({
        user_id: OTHER,
        address_text: "Someone Else",
        is_default: true,
      }),
    );

    await saveDefaultAddress(db, USER, {
      addressText: "Flat 2, Main Road",
      lat: 12.9,
      lng: 77.6,
    });

    const other = rows.find((row) => row.user_id === OTHER);
    expect(other?.is_default).toBe(true);
    expect(other?.address_text).toBe("Someone Else");
  });
});

describe("updateAddress", () => {
  it("changes the stored text", async () => {
    const db = client();
    const saved = await saveDefaultAddress(db, USER, {
      addressText: "Flat 2, Main Road",
      lat: 12.9,
      lng: 77.6,
    });

    const updated = await updateAddress(db, USER, {
      id: saved.id,
      addressText: "Flat 9, Nehru Nagar",
    });

    expect(updated.address_text).toBe("Flat 9, Nehru Nagar");
  });

  it("leaves the default flag alone", async () => {
    const db = client();
    const saved = await saveDefaultAddress(db, USER, {
      addressText: "Flat 2, Main Road",
      lat: 12.9,
      lng: 77.6,
    });

    const updated = await updateAddress(db, USER, {
      id: saved.id,
      addressText: "Flat 9, Nehru Nagar",
    });

    expect(updated.is_default).toBe(true);
  });

  it("refuses to blank an address", async () => {
    const db = client();
    const saved = await saveDefaultAddress(db, USER, {
      addressText: "Flat 2, Main Road",
      lat: 12.9,
      lng: 77.6,
    });

    await expect(
      updateAddress(db, USER, { id: saved.id, addressText: "" }),
    ).rejects.toBeInstanceOf(AddressError);
  });

  it("cannot reach an address belonging to somebody else", async () => {
    const db = client();
    const theirs = makeRow({ user_id: OTHER, address_text: "Someone Else" });
    rows.push(theirs);

    await expect(
      updateAddress(db, USER, { id: theirs.id, addressText: "Hijacked" }),
    ).rejects.toBeInstanceOf(AddressError);

    expect(rows.find((row) => row.id === theirs.id)?.address_text).toBe(
      "Someone Else",
    );
  });

  it("renames the label when given one", async () => {
    const db = client();
    const saved = await saveDefaultAddress(db, USER, {
      addressText: "Flat 2, Main Road",
      lat: 12.9,
      lng: 77.6,
    });

    const updated = await updateAddress(db, USER, {
      id: saved.id,
      addressText: "Flat 2, Main Road",
      label: "Office",
    });

    expect(updated.label).toBe("Office");
  });
});

describe("setDefaultAddress", () => {
  it("promotes the chosen address and demotes the previous default", async () => {
    const db = client();

    await saveDefaultAddress(db, USER, {
      addressText: "Flat 2, Main Road",
      lat: 12.9,
      lng: 77.6,
    });

    const second = await saveDefaultAddress(db, USER, {
      addressText: "Flat 3, Main Road",
      lat: 12.9,
      lng: 77.6,
    });

    const listed = await setDefaultAddress(db, USER, second.id);

    expect(listed.filter((row) => row.is_default)).toHaveLength(1);
    expect(listed[0]?.id).toBe(second.id);
  });

  it("returns the list ordered default first", async () => {
    const db = client();

    const first = await saveDefaultAddress(db, USER, {
      addressText: "Flat 2, Main Road",
      lat: 12.9,
      lng: 77.6,
    });

    const second = await saveDefaultAddress(db, USER, {
      addressText: "Flat 3, Main Road",
      lat: 12.9,
      lng: 77.6,
    });

    const listed = await setDefaultAddress(db, USER, first.id);

    expect(listed[0]?.id).toBe(first.id);
    expect(listed.some((row) => row.id === second.id)).toBe(true);
  });

  it("cannot promote an address belonging to somebody else", async () => {
    const db = client();
    const theirs = makeRow({ user_id: OTHER });
    rows.push(theirs);

    await expect(setDefaultAddress(db, USER, theirs.id)).rejects.toBeInstanceOf(
      AddressError,
    );
  });
});

describe("deleteAddress", () => {
  it("removes the row", async () => {
    const db = client();
    const saved = await saveDefaultAddress(db, USER, {
      addressText: "Flat 2, Main Road",
      lat: 12.9,
      lng: 77.6,
    });

    const remaining = await deleteAddress(db, USER, saved.id);

    expect(rows).toHaveLength(0);
    expect(remaining).toHaveLength(0);
  });

  /**
   * Nothing requires a default to exist, and every read falls back to the most
   * recent row. Blocking this would leave a customer unable to remove an address
   * they no longer live at.
   */
  it("allows the default to be deleted", async () => {
    const db = client();
    const saved = await saveDefaultAddress(db, USER, {
      addressText: "Flat 2, Main Road",
      lat: 12.9,
      lng: 77.6,
    });

    await deleteAddress(db, USER, saved.id);

    expect(rows.filter((row) => row.is_default)).toHaveLength(0);
  });

  it("cannot delete an address belonging to somebody else", async () => {
    const db = client();
    const theirs = makeRow({ user_id: OTHER });
    rows.push(theirs);

    await expect(deleteAddress(db, USER, theirs.id)).rejects.toBeInstanceOf(
      AddressError,
    );

    expect(rows).toHaveLength(1);
  });
});

describe("getPrefillAddress", () => {
  it("returns null for a customer who has never booked", async () => {
    expect(await getPrefillAddress(client(), USER)).toBeNull();
  });

  it("returns the default address", async () => {
    const db = client();
    const saved = await saveDefaultAddress(db, USER, {
      addressText: "Flat 2, Main Road",
      lat: 12.9,
      lng: 77.6,
    });

    expect((await getPrefillAddress(db, USER))?.id).toBe(saved.id);
  });

  it("returns nothing for a customer who is not signed in", async () => {
    const db = client();
    await saveDefaultAddress(db, USER, {
      addressText: "Flat 2, Main Road",
      lat: 12.9,
      lng: 77.6,
    });

    expect(await getPrefillAddress(db, OTHER)).toBeNull();
  });
});
