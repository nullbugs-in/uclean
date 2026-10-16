import { describe, expect, it } from "vitest";

import type { DbClient, OrderStatus } from "@/db/types";
import { allowedTransitions } from "@/lib/order-status";

import {
  OrderConflictError,
  OrderEditError,
  advanceOrderStatus,
} from "./admin-orders";

/**
 * A booking row as the two write paths touch it.
 *
 * Only the columns either path reads or writes are modelled. That is deliberate:
 * if the code starts depending on something else, the fake stops compiling and
 * this test says so rather than quietly passing.
 */
type Row = {
  id: string;
  status: OrderStatus;
  cancellation_reason: string | null;
  updated_at: string;
};

const ORDER = "11111111-1111-1111-1111-111111111111";

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: ORDER,
    status: "picked_up",
    cancellation_reason: null,
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

/** PostgREST's "no such function" reply, which is what an un-applied migration looks like. */
const NO_FUNCTION = {
  code: "PGRST202",
  message:
    "Could not find the function public.admin_change_order_status in the schema cache",
};

type FakeOptions = {
  rows?: Row[];
  /** When set, `.rpc()` returns this instead of succeeding. */
  rpcError?: { code: string; message: string } | null;
};

/**
 * A stand-in for the pieces of the client these two paths use.
 *
 * The update builder enforces the two things the real database would: the
 * primary key, and the `.eq("status", ...)` guard the fallback relies on for
 * optimistic concurrency. The transition table is enforced too, from the same
 * source the UI reads, so a test can prove the fallback still cannot make an
 * illegal jump.
 */
function fakeClient(options: FakeOptions = {}) {
  const rows = (options.rows ?? [row()]).map((entry) => ({ ...entry }));
  /** Every path taken, so a test can assert which one ran. */
  const calls: string[] = [];

  const client = {
    async rpc(name: string) {
      calls.push(`rpc:${name}`);

      if (options.rpcError) {
        return { data: null, error: options.rpcError };
      }

      return { data: null, error: null };
    },

    from(table: string) {
      if (table !== "orders") throw new Error(`unexpected table ${table}`);

      const filters = new Map<string, unknown>();
      let patch: Partial<Row> | null = null;

      const builder = {
        update(values: Partial<Row>) {
          patch = values;
          calls.push("update");
          return builder;
        },
        select() {
          return builder;
        },
        eq(column: string, value: unknown) {
          filters.set(column, value);
          return builder;
        },
        async maybeSingle() {
          const matches = rows.filter((entry) =>
            [...filters].every(
              ([column, value]) => entry[column as keyof Row] === value,
            ),
          );

          const found = matches[0] ?? null;

          if (patch === null) {
            calls.push("read");
            return { data: found, error: null };
          }

          calls.push("write");

          // Zero rows matched. Either the row is gone or the status guard failed;
          // the caller reads back to tell those apart.
          if (!found) return { data: null, error: null };

          // The BEFORE UPDATE trigger mirrors `allowed_order_transition`, so an
          // illegal jump raises a check violation rather than landing.
          const next = patch.status;
          if (
            next &&
            next !== found.status &&
            !allowedTransitions(found.status).includes(next)
          ) {
            return {
              data: null,
              error: {
                code: "23514",
                message: `Invalid order status transition: ${found.status} -> ${next}`,
              },
            };
          }

          Object.assign(found, patch);
          return { data: { id: found.id }, error: null };
        },
      };

      return builder;
    },
  };

  return { client: client as unknown as DbClient, rows, calls };
}

describe("advanceOrderStatus", () => {
  /**
   * The preferred path. Notes and the row lock only exist inside the function, so
   * when it is available nothing else may be used.
   */
  it("uses the RPC when the function exists", async () => {
    const { client, calls } = fakeClient();

    const result = await advanceOrderStatus(client, {
      orderId: ORDER,
      to: "under_analysis",
      expectedStatus: "picked_up",
      note: "Bag weighed",
    });

    expect(calls).toEqual(["rpc:admin_change_order_status"]);
    expect(result.noteDropped).toBe(false);
  });

  /**
   * The bug this test exists for. An un-applied migration used to make the
   * Bookings module read-only: every status change failed with "We could not save
   * those changes", and the admin had no way to move a booking at all.
   */
  it("falls back to a direct update when the function is missing", async () => {
    const { client, rows, calls } = fakeClient({ rpcError: NO_FUNCTION });

    const result = await advanceOrderStatus(client, {
      orderId: ORDER,
      to: "under_analysis",
      expectedStatus: "picked_up",
    });

    expect(calls).toContain("update");
    expect(rows[0]?.status).toBe("under_analysis");
    expect(result.noteDropped).toBe(false);
  });

  /**
   * Honesty about the fallback's one limitation. The stage did change, so this is
   * not a failure — but an admin who typed a note has to be told it went nowhere.
   */
  it("reports a dropped note on the fallback rather than pretending it saved", async () => {
    const { client, rows } = fakeClient({ rpcError: NO_FUNCTION });

    const result = await advanceOrderStatus(client, {
      orderId: ORDER,
      to: "under_analysis",
      expectedStatus: "picked_up",
      note: "Customer not home, left with security",
    });

    expect(rows[0]?.status).toBe("under_analysis");
    expect(result.noteDropped).toBe(true);
  });

  /**
   * Concurrency. The fallback is a single `UPDATE ... WHERE id = ? AND status = ?`,
   * so a colleague moving the booking first leaves zero rows affected. That has to
   * surface as a reload prompt, not as a success.
   */
  it("reports a conflict when the booking moved on", async () => {
    const { client } = fakeClient({
      rows: [row({ status: "in_process" })],
      rpcError: NO_FUNCTION,
    });

    await expect(
      advanceOrderStatus(client, {
        orderId: ORDER,
        to: "under_analysis",
        expectedStatus: "picked_up",
      }),
    ).rejects.toBeInstanceOf(OrderConflictError);
  });

  it("reports a conflict from the RPC too", async () => {
    const { client } = fakeClient({
      rpcError: { code: "40001", message: "already moved" },
    });

    await expect(
      advanceOrderStatus(client, {
        orderId: ORDER,
        to: "under_analysis",
        expectedStatus: "picked_up",
      }),
    ).rejects.toBeInstanceOf(OrderConflictError);
  });

  /**
   * The state machine still holds on the fallback. It is enforced by a trigger on
   * the table, not by the function, so removing the function does not remove the
   * rule.
   */
  it("still refuses an illegal jump on the fallback", async () => {
    const { client, rows } = fakeClient({ rpcError: NO_FUNCTION });

    await expect(
      advanceOrderStatus(client, {
        orderId: ORDER,
        to: "delivered",
        expectedStatus: "picked_up",
      }),
    ).rejects.toBeInstanceOf(OrderEditError);

    // And nothing landed.
    expect(rows[0]?.status).toBe("picked_up");
  });

  /**
   * `cancellation_reason` is only ever a cancellation reason. The RPC this
   * replaces wrote every stage note there, which meant a pickup note later read
   * as the reason for a cancellation that never happened.
   */
  it("writes the reason on a cancellation and nothing on any other stage", async () => {
    const cancelled = fakeClient({
      rows: [row({ status: "agent_assigned" })],
      rpcError: NO_FUNCTION,
    });

    await advanceOrderStatus(cancelled.client, {
      orderId: ORDER,
      to: "cancelled",
      expectedStatus: "agent_assigned",
      reason: "Customer asked to cancel",
    });

    expect(cancelled.rows[0]?.cancellation_reason).toBe(
      "Customer asked to cancel",
    );

    const advanced = fakeClient({ rpcError: NO_FUNCTION });

    await advanceOrderStatus(advanced.client, {
      orderId: ORDER,
      to: "under_analysis",
      expectedStatus: "picked_up",
      note: "Bag weighed",
    });

    expect(advanced.rows[0]?.cancellation_reason).toBeNull();
  });

  /** A cancellation must still record something, even when the reason is blank. */
  it("records a placeholder reason when a cancellation gives none", async () => {
    const { client, rows } = fakeClient({
      rows: [row({ status: "agent_assigned" })],
      rpcError: NO_FUNCTION,
    });

    await advanceOrderStatus(client, {
      orderId: ORDER,
      to: "cancelled",
      expectedStatus: "agent_assigned",
    });

    expect(rows[0]?.cancellation_reason).toBe("No reason given");
  });

  /**
   * A missing row and a lost race look identical at the SQL level and must not be
   * conflated: telling an admin to reload a booking that does not exist sends them
   * round a loop that never resolves.
   */
  it("does not report a missing booking as a conflict", async () => {
    const { client } = fakeClient({ rows: [], rpcError: NO_FUNCTION });

    const failure = await advanceOrderStatus(client, {
      orderId: ORDER,
      to: "under_analysis",
      expectedStatus: "picked_up",
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(OrderEditError);
    // The specific distinction: a conflict tells the admin to reload, which is
    // useless advice for a booking that is not there.
    expect(failure).not.toBeInstanceOf(OrderConflictError);
  });
});
