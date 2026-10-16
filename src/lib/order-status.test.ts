import { describe, expect, it } from "vitest";

import {
  ADMIN_TIMELINE,
  allowedTransitions,
  canTransition,
  CUSTOMER_STATUS_LABEL,
  CUSTOMER_TIMELINE,
  INTERNAL_STATUS_LABEL,
  isTerminalStatus,
  ORDER_STATUSES,
  type OrderStatus,
} from "./order-status";

/**
 * The state machine exists in two places: this file and
 * `public.allowed_order_transition` in
 * supabase/migrations/20260101000008_indexes_functions_and_rls.sql.
 *
 * These tests assert the TypeScript side is internally sound. They cannot see
 * the SQL, so the cross-check is the transition list in SQL_PARITY below, which
 * is a verbatim copy of the SQL VALUES clause. If you change a transition here,
 * change it there and update the copy, or the database will reject a button the
 * UI offers.
 */

const SQL_PARITY: ReadonlyArray<[OrderStatus, OrderStatus]> = [
  ["pickup_requested", "agent_assigned"],
  ["pickup_requested", "cancelled"],
  ["agent_assigned", "picked_up"],
  ["agent_assigned", "cancelled"],
  ["picked_up", "under_analysis"],
  ["picked_up", "invoice_sent"],
  ["under_analysis", "invoice_sent"],
  ["under_analysis", "in_process"],
  ["invoice_sent", "payment_pending"],
  ["invoice_sent", "paid"],
  ["invoice_sent", "in_process"],
  ["payment_pending", "paid"],
  ["payment_pending", "in_process"],
  ["paid", "in_process"],
  ["paid", "ready_for_delivery"],
  ["in_process", "ready_for_delivery"],
  ["ready_for_delivery", "out_for_delivery"],
  ["out_for_delivery", "delivered"],
];

describe("order state machine", () => {
  it("allows exactly the transitions the database allows", () => {
    const fromTypescript = ORDER_STATUSES.flatMap((from) =>
      allowedTransitions(from).map((to) => [from, to] as const),
    ).sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));

    const fromSql = [...SQL_PARITY].sort(
      (a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]),
    );

    expect(fromTypescript).toEqual(fromSql);
  });

  it("rejects a self transition", () => {
    for (const status of ORDER_STATUSES) {
      expect(canTransition(status, status)).toBe(false);
    }
  });

  it("treats delivered and cancelled as terminal", () => {
    expect(isTerminalStatus("delivered")).toBe(true);
    expect(isTerminalStatus("cancelled")).toBe(true);
    expect(isTerminalStatus("pickup_requested")).toBe(false);
  });

  it("does not allow cancelling once the order has been picked up", () => {
    // Section 7 allows cancellation only "before pickup".
    const postPickup: OrderStatus[] = [
      "picked_up",
      "under_analysis",
      "invoice_sent",
      "payment_pending",
      "paid",
      "in_process",
      "ready_for_delivery",
      "out_for_delivery",
      "delivered",
    ];

    for (const status of postPickup) {
      expect(allowedTransitions(status)).not.toContain("cancelled");
    }
  });

  it("allows cancelling only from the two states before pickup", () => {
    const cancellable = ORDER_STATUSES.filter((status) =>
      allowedTransitions(status).includes("cancelled"),
    );
    expect(cancellable).toEqual(["pickup_requested", "agent_assigned"]);
  });

  it("only allows reaching out_for_delivery from ready_for_delivery", () => {
    const sources = ORDER_STATUSES.filter((status) =>
      canTransition(status, "out_for_delivery"),
    );
    expect(sources).toEqual(["ready_for_delivery"]);
  });

  it("only allows reaching delivered from out_for_delivery", () => {
    const sources = ORDER_STATUSES.filter((status) =>
      canTransition(status, "delivered"),
    );
    expect(sources).toEqual(["out_for_delivery"]);
  });

  it("orders the customer timeline as the architecture document describes", () => {
    expect(CUSTOMER_TIMELINE).toEqual([
      "pickup_requested",
      "agent_assigned",
      "picked_up",
      "under_analysis",
      "invoice_sent",
      "in_process",
      "ready_for_delivery",
      "out_for_delivery",
      "delivered",
    ]);
  });

  it("labels every status for customers and for staff", () => {
    // A missing label would render as undefined in the UI.
    for (const status of ORDER_STATUSES) {
      expect(CUSTOMER_STATUS_LABEL[status]).toBeTruthy();
      expect(INTERNAL_STATUS_LABEL[status]).toBeTruthy();
    }
  });
});

/**
 * The customer tracking timeline used to show two steps both labelled "In
 * Process", because `under_analysis` and `in_process` shared a customer label
 * while being distinct operations. These lock the fix in place.
 */
describe("customer labels", () => {
  it("distinguishes the two processing stages", () => {
    expect(CUSTOMER_STATUS_LABEL.under_analysis).not.toBe(
      CUSTOMER_STATUS_LABEL.in_process,
    );
  });

  it("keeps every customer label distinct across the timeline", () => {
    // A duplicate anywhere in the visible timeline is the bug being guarded.
    const labels = CUSTOMER_TIMELINE.map(
      (status) => CUSTOMER_STATUS_LABEL[status],
    );

    expect(new Set(labels).size).toBe(labels.length);
  });

  it("still distinguishes every internal label", () => {
    const labels = ORDER_STATUSES.map(
      (status) => INTERNAL_STATUS_LABEL[status],
    );

    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("ADMIN_TIMELINE", () => {
  it("includes the two payment states the customer timeline hides", () => {
    // Without these, an admin timeline jumps from Invoice Sent to Processing
    // Complete and never shows where the booking actually is on payment.
    expect(ADMIN_TIMELINE).toContain("payment_pending");
    expect(ADMIN_TIMELINE).toContain("paid");
    expect(CUSTOMER_TIMELINE).not.toContain("payment_pending");
    expect(CUSTOMER_TIMELINE).not.toContain("paid");
  });

  it("starts at pickup and ends at delivery", () => {
    expect(ADMIN_TIMELINE[0]).toBe("pickup_requested");
    expect(ADMIN_TIMELINE[ADMIN_TIMELINE.length - 1]).toBe("delivered");
  });

  it("orders the payment states where the state machine puts them", () => {
    expect(ADMIN_TIMELINE.indexOf("invoice_sent")).toBeLessThan(
      ADMIN_TIMELINE.indexOf("payment_pending"),
    );
    expect(ADMIN_TIMELINE.indexOf("payment_pending")).toBeLessThan(
      ADMIN_TIMELINE.indexOf("paid"),
    );
    expect(ADMIN_TIMELINE.indexOf("paid")).toBeLessThan(
      ADMIN_TIMELINE.indexOf("in_process"),
    );
  });

  it("covers every non-cancelled status exactly once", () => {
    const expected = ORDER_STATUSES.filter((status) => status !== "cancelled");

    expect([...ADMIN_TIMELINE].sort()).toEqual([...expected].sort());
  });

  /**
   * The timeline is only useful if it does not contain jumps the database would
   * reject. If a step here is not a legal successor of the one before it, the
   * admin would be shown a progress bar implying a path that does not exist.
   */
  it("never places a step the state machine cannot reach from the previous one", () => {
    for (let index = 1; index < ADMIN_TIMELINE.length; index += 1) {
      const previous = ADMIN_TIMELINE[index - 1] as OrderStatus;
      const current = ADMIN_TIMELINE[index] as OrderStatus;

      expect(
        allowedTransitions(previous),
        `${previous} -> ${current} is not an allowed transition`,
      ).toContain(current);
    }
  });
});
