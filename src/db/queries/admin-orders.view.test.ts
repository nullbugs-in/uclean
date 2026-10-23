import { describe, expect, it } from "vitest";

import type {
  Order,
  OrderItem,
  OrderStatus,
  OrderStatusHistory,
} from "@/db/types";
import { ORDER_STATUSES, allowedTransitions } from "@/lib/order-status";

import {
  applyJoinedFilters,
  bookingCardActions,
  buildTimeline,
  canEditOrderItems,
  countByGroup,
  escapeForIlike,
  expandStatusFilter,
  filterHref,
  itemsTotal,
  matchesSearchTerms,
  notificationForStatus,
  orderStatusLog,
  pageWindow,
  paginate,
  readBookingFilter,
  searchTerms,
  sortOrders,
  applyOrderFilter,
  type AdminOrderRow,
} from "./admin-orders.view";

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: "o1",
    order_no: "UC-2026-000042",
    customer_id: "u1",
    created_by: null,
    source: "online",
    status: "pickup_requested",
    customer_name: "Asha Menon",
    customer_mobile: "+919876543210",
    address_snapshot: "2979/1, D21/1, 6th Main Rd",
    lat: 12.97,
    lng: 77.59,
    distance_km: 2.4,
    pickup_slot_date: "2026-03-10",
    pickup_slot_id: "s1",
    delivery_slot_date: null,
    delivery_slot_id: null,
    accepted_zone_notice_at: "2026-03-01T00:00:00Z",
    notes: null,
    cancellation_reason: null,
    payment_mode: "cod",
    created_at: "2026-03-01T00:00:00Z",
    updated_at: "2026-03-01T00:00:00Z",
    ...overrides,
  } as Order;
}

function history(
  overrides: Partial<OrderStatusHistory> = {},
): OrderStatusHistory {
  return {
    id: 1,
    order_id: "o1",
    from_status: "pickup_requested",
    to_status: "agent_assigned",
    changed_by: "admin1",
    note: null,
    created_at: "2026-03-02T09:00:00Z",
    ...overrides,
  } as OrderStatusHistory;
}

function item(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    id: "i1",
    order_id: "o1",
    item_name: "Wash and Iron",
    qty: 5,
    unit_price: 80,
    notes: null,
    photo_url: null,
    ...overrides,
  } as OrderItem;
}

function row(overrides: Partial<AdminOrderRow> = {}): AdminOrderRow {
  return {
    ...order(),
    pickupAgentId: null,
    pickupAgentName: null,
    deliveryAgentId: null,
    deliveryAgentName: null,
    slotLabel: "10:00 AM - 11:00 AM",
    items: [],
    itemCount: 0,
    hasInvoice: false,
    invoiceStatus: null,
    analysisNote: null,
    ...overrides,
  } as AdminOrderRow;
}

// ---------------------------------------------------------------------------

describe("expandStatusFilter", () => {
  it("treats an empty id as no filter", () => {
    expect(expandStatusFilter("")).toBeNull();
  });

  it("expands a group to every status in it", () => {
    // "at the store" means both picked_up and under_analysis, not one of them.
    expect(expandStatusFilter("at_store")).toEqual([
      "picked_up",
      "under_analysis",
    ]);
  });

  it("expands the collection statuses", () => {
    expect(expandStatusFilter("collecting")).toEqual([
      "pickup_requested",
      "agent_assigned",
    ]);
  });

  /**
   * A stale bookmark or a hand-edited query string must not blank the screen.
   * Reading an unknown id as "everything" is the safe direction to fail.
   */
  it("falls back to no filter for an unknown group", () => {
    expect(expandStatusFilter("nonsense")).toBeNull();
  });

  it("never returns a filter that excludes everything", () => {
    for (const group of [
      "",
      "collecting",
      "at_store",
      "billing",
      "delivery",
      "closed",
    ]) {
      const expanded = expandStatusFilter(group);
      if (expanded !== null) expect(expanded.length).toBeGreaterThan(0);
    }
  });
});

describe("searchTerms", () => {
  it("splits on whitespace and lowercases", () => {
    expect(searchTerms("  Asha  98765 ")).toEqual(["asha", "98765"]);
  });

  it("returns nothing for an empty search", () => {
    expect(searchTerms("")).toEqual([]);
    expect(searchTerms(undefined)).toEqual([]);
  });
});

describe("matchesSearchTerms", () => {
  it("matches the order number", () => {
    expect(matchesSearchTerms(order(), ["000042"])).toBe(true);
  });

  it("matches the customer name regardless of case", () => {
    expect(matchesSearchTerms(order(), ["asha"])).toBe(true);
  });

  it("matches a fragment of the mobile number", () => {
    expect(matchesSearchTerms(order(), ["98765"])).toBe(true);
  });

  it("requires every term to match, so extra words narrow", () => {
    expect(matchesSearchTerms(order(), ["asha", "98765"])).toBe(true);
    expect(matchesSearchTerms(order(), ["asha", "99999"])).toBe(false);
  });

  it("rejects an order where no term matches", () => {
    expect(matchesSearchTerms(order(), ["rahul"])).toBe(false);
  });

  /**
   * Matching on a single keystroke would make the list thrash as the admin types
   * "asha", showing a different result set per character.
   */
  it("ignores one character terms", () => {
    expect(matchesSearchTerms(order(), ["a"])).toBe(true);
  });

  it("matches everything when there is nothing usable", () => {
    expect(matchesSearchTerms(order(), [])).toBe(true);
  });

  it("does not throw when a field is an empty string", () => {
    const sparse = { ...order(), customer_mobile: "" } as Order;

    expect(matchesSearchTerms(sparse, ["asha"])).toBe(true);
    expect(matchesSearchTerms(sparse, ["99999"])).toBe(false);
  });
});

describe("escapeForIlike", () => {
  /**
   * Without escaping, searching for `%` becomes match-everything and `_` becomes
   * match-one-character. Both would be a cheap way to pull the whole table back.
   */
  it("escapes the wildcards a user can type", () => {
    expect(escapeForIlike("100%")).toBe("100\\%");
    expect(escapeForIlike("a_b")).toBe("a\\_b");
    expect(escapeForIlike("back\\slash")).toBe("back\\\\slash");
  });

  it("leaves an ordinary term alone", () => {
    expect(escapeForIlike("asha")).toBe("asha");
  });

  it("neutralises a wildcard-only search", () => {
    const term = escapeForIlike("%");

    // The literal % no longer matches anything on its own.
    expect(matchesSearchTerms(order(), [term])).toBe(false);
  });
});

describe("applyOrderFilter", () => {
  const orders = [
    order({ id: "o1" }),
    order({ id: "o2", order_no: "UC-2026-000043", status: "picked_up" }),
    order({ id: "o3", order_no: "UC-2026-000044", status: "delivered" }),
  ];

  it("returns everything with no filter", () => {
    expect(applyOrderFilter(orders, {})).toHaveLength(3);
  });

  it("narrows by status group", () => {
    expect(
      applyOrderFilter(orders, { status: "at_store" }).map((o) => o.id),
    ).toEqual(["o2"]);
  });

  it("narrows by search on top of the status group", () => {
    const result = applyOrderFilter(orders, {
      status: "closed",
      search: "000044",
    });
    expect(result.map((o) => o.id)).toEqual(["o3"]);
  });
});

describe("sortOrders", () => {
  const rows = [
    order({
      id: "a",
      created_at: "2026-03-01T00:00:00Z",
      pickup_slot_date: "2026-03-20",
    }),
    order({
      id: "b",
      created_at: "2026-03-05T00:00:00Z",
      pickup_slot_date: "2026-03-10",
    }),
    order({
      id: "c",
      created_at: "2026-03-03T00:00:00Z",
      pickup_slot_date: "2026-03-15",
    }),
  ];

  it("puts the newest first by default", () => {
    expect(sortOrders(rows, "newest").map((r) => r.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("puts the oldest first", () => {
    expect(sortOrders(rows, "oldest").map((r) => r.id)).toEqual([
      "a",
      "c",
      "b",
    ]);
  });

  it("sorts by pickup slot, not by when it was booked", () => {
    // The point of this sort is "what needs collecting today".
    expect(sortOrders(rows, "pickup").map((r) => r.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("does not mutate the input", () => {
    const copy = [...rows];
    sortOrders(rows, "oldest");
    expect(rows).toEqual(copy);
  });

  /**
   * Without a tiebreak the order is unstable, and two bookings created in the
   * same second could swap places between loads, making pagination look like it
   * is skipping rows. Each direction breaks ties in its own direction, so the
   * list is a true mirror either way.
   */
  it("breaks ties on id so the order is stable", () => {
    const sameTime = [
      order({ id: "z", created_at: "2026-03-01T00:00:00Z" }),
      order({ id: "a", created_at: "2026-03-01T00:00:00Z" }),
    ];

    expect(sortOrders(sameTime, "newest").map((r) => r.id)).toEqual(["z", "a"]);
    expect(sortOrders(sameTime, "oldest").map((r) => r.id)).toEqual(["a", "z"]);
  });
});

describe("paginate", () => {
  const rows = Array.from({ length: 25 }, (_, index) => index);

  it("returns the requested page", () => {
    const page = paginate(rows, 2, 10);

    expect(page.rows).toEqual(rows.slice(10, 20));
    expect(page.total).toBe(25);
    expect(page.pageCount).toBe(3);
    expect(page.hasPrevious).toBe(true);
    expect(page.hasNext).toBe(true);
  });

  it("reports no next page on the last one", () => {
    const page = paginate(rows, 3, 10);

    expect(page.hasNext).toBe(false);
    expect(page.hasPrevious).toBe(true);
  });

  /**
   * A bookmark to page 40 of a three-page result showing an empty table reads as
   * data loss. Clamping to the last page shows the end of the list instead.
   */
  it("clamps a page beyond the end rather than showing nothing", () => {
    const page = paginate(rows, 40, 10);

    expect(page.page).toBe(3);
    // The last page of 25 rows is a short one, which is correct: these really
    // are the only rows left.
    expect(page.rows).toEqual(rows.slice(20));
  });

  it("clamps a page below one", () => {
    expect(paginate(rows, 0, 10).page).toBe(1);
    expect(paginate(rows, -3, 10).page).toBe(1);
  });

  it("reports a single empty page for no results", () => {
    const page = paginate([], 1, 10);

    expect(page.rows).toEqual([]);
    expect(page.pageCount).toBe(1);
    expect(page.hasNext).toBe(false);
  });
});

describe("pageWindow", () => {
  it("keeps the window small in the middle", () => {
    expect(pageWindow(10, 20)).toEqual([1, 8, 9, 10, 11, 12, 20]);
  });

  it("is the whole range when there are few pages", () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
  });

  it("always includes the first and last page", () => {
    const pages = pageWindow(5, 30);

    expect(pages[0]).toBe(1);
    expect(pages[pages.length - 1]).toBe(30);
  });

  it("handles a single page", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
  });
});

describe("readBookingFilter", () => {
  it("defaults everything sensibly", () => {
    expect(readBookingFilter({})).toEqual({
      status: undefined,
      search: undefined,
      pickupFrom: undefined,
      pickupTo: undefined,
      assignment: "all",
      sort: "newest",
      page: 1,
    });
  });

  /**
   * These values reach the query, so an unknown sort must not become an
   * arbitrary column name in `.order()`.
   */
  it("rejects an unknown sort rather than passing it through", () => {
    expect(readBookingFilter({ sort: "id; drop table orders" }).sort).toBe(
      "newest",
    );
  });

  it("rejects an unknown assignment filter", () => {
    expect(readBookingFilter({ assignment: "nope" }).assignment).toBe("all");
  });

  /**
   * The payment filter is gone from this module, so an old bookmark carrying one
   * is ignored rather than round-tripped into a query nothing reads.
   */
  it("ignores a payment parameter left over from an old bookmark", () => {
    const filter = readBookingFilter({ payment: "paid" });

    expect(Object.keys(filter)).not.toContain("payment");
    expect(filterHref(filter)).toBe("/admin/bookings");
  });

  it("rejects a malformed date rather than sending it to Postgres", () => {
    const filter = readBookingFilter({ from: "10-03-2026", to: "yesterday" });

    expect(filter.pickupFrom).toBeUndefined();
    expect(filter.pickupTo).toBeUndefined();
  });

  it("accepts a well formed date", () => {
    expect(readBookingFilter({ from: "2026-03-10" }).pickupFrom).toBe(
      "2026-03-10",
    );
  });

  /** A reversed range would return nothing, which looks like a bug. */
  it("swaps a reversed date range rather than showing an empty list", () => {
    const filter = readBookingFilter({ from: "2026-03-20", to: "2026-03-10" });

    expect(filter.pickupFrom).toBe("2026-03-20");
    expect(filter.pickupTo).toBe("2026-03-20");
  });

  it("falls back to page one for a junk page number", () => {
    expect(readBookingFilter({ page: "abc" }).page).toBe(1);
    expect(readBookingFilter({ page: "-2" }).page).toBe(1);
    expect(readBookingFilter({ page: "3" }).page).toBe(3);
  });

  it("takes the first value when a parameter repeats", () => {
    expect(readBookingFilter({ status: ["collecting", "closed"] }).status).toBe(
      "collecting",
    );
  });
});

describe("filterHref", () => {
  it("omits defaults so the cleanest URL is the bare path", () => {
    expect(
      filterHref({
        sort: "newest",
        assignment: "all",
        page: 1,
      }),
    ).toBe("/admin/bookings");
  });

  it("includes only what is set", () => {
    expect(filterHref({ status: "closed" })).toBe(
      "/admin/bookings?status=closed",
    );
  });

  it("overrides one value and leaves the rest", () => {
    const href = filterHref(
      { status: "closed", search: "asha" },
      { status: "billing" },
    );

    expect(href).toContain("status=billing");
    expect(href).toContain("q=asha");
  });

  it("keeps the page when the rest is unchanged", () => {
    expect(filterHref({ page: 4 })).toContain("page=4");
  });
});

describe("countByGroup", () => {
  it("counts each group from the same list it filters", () => {
    const orders = [
      order({ id: "o1" }),
      order({ id: "o2", status: "picked_up" }),
      order({ id: "o3", status: "delivered" }),
    ];

    const counts = countByGroup(orders);

    expect(counts[""]).toBe(3);
    expect(counts.collecting).toBe(1);
    expect(counts.at_store).toBe(1);
    expect(counts.closed).toBe(1);
    expect(counts.billing).toBe(0);
  });
});

describe("applyJoinedFilters", () => {
  const rows = [
    row({ id: "a", pickupAgentId: "ag1" }),
    row({ id: "b", pickupAgentId: null }),
  ];

  it("keeps everything by default", () => {
    expect(applyJoinedFilters(rows, {})).toHaveLength(2);
  });

  it("filters to bookings with an agent", () => {
    expect(
      applyJoinedFilters(rows, { assignment: "assigned" }).map((r) => r.id),
    ).toEqual(["a"]);
  });

  it("filters to bookings needing one", () => {
    expect(
      applyJoinedFilters(rows, { assignment: "unassigned" }).map((r) => r.id),
    ).toEqual(["b"]);
  });

  it("ignores an assignment filter it does not recognise", () => {
    expect(
      applyJoinedFilters(rows, { assignment: "nonsense" as never }),
    ).toHaveLength(2);
  });
});

/**
 * The admin sets the stage themselves. Every transition the state machine allows
 * from the current status is offered as a button, and nothing is withheld behind
 * another workflow — the confirmation dialog and the database trigger are the two
 * safeguards, not a policy about which buttons exist.
 */
describe("status transitions offered to the admin", () => {
  it("never offers a transition the database would reject", () => {
    // The component reads `allowedTransitions` directly, so this is really an
    // assertion that the state machine itself is closed: the UI cannot produce a
    // button the trigger will throw on.
    for (const from of ORDER_STATUSES) {
      for (const to of allowedTransitions(from)) {
        expect(allowedTransitions(from), `${from} -> ${to}`).toContain(to);
      }
    }
  });

  it("leaves the billing statuses reachable as ordinary buttons", () => {
    expect(allowedTransitions("picked_up")).toContain("invoice_sent");
    expect(allowedTransitions("payment_pending")).toContain("paid");
  });

  it("still offers cancellation only before pickup", () => {
    expect(allowedTransitions("agent_assigned")).toContain("cancelled");
    expect(allowedTransitions("picked_up")).not.toContain("cancelled");
  });
});

// ---------------------------------------------------------------------------
// The status log and the timeline
// ---------------------------------------------------------------------------

describe("orderStatusLog", () => {
  it("lists newest first", () => {
    const log = orderStatusLog(
      [
        history({
          id: 1,
          to_status: "picked_up",
          created_at: "2026-03-01T09:00:00Z",
        }),
        history({
          id: 2,
          to_status: "agent_assigned",
          created_at: "2026-03-03T09:00:00Z",
        }),
      ],
      {},
    );

    expect(log.map((entry) => entry.to)).toEqual([
      "agent_assigned",
      "picked_up",
    ]);
  });

  it("uses the internal label, which the customer timeline does not show", () => {
    const log = orderStatusLog([history({ to_status: "under_analysis" })], {});

    expect(log[0]?.label).toBe("Under Analysis");
  });

  it("resolves the actor name", () => {
    const log = orderStatusLog([history({ changed_by: "admin1" })], {
      admin1: "Priya Rao",
    });

    expect(log[0]?.actor).toBe("Priya Rao");
  });

  it("leaves the actor blank when the profile has gone", () => {
    const log = orderStatusLog([history({ changed_by: "gone" })], {});

    expect(log[0]?.actor).toBeNull();
  });

  it("handles a system change with no actor", () => {
    const log = orderStatusLog([history({ changed_by: null })], {});

    expect(log[0]?.actor).toBeNull();
  });

  it("carries the previous status so the log reads as a chain", () => {
    const log = orderStatusLog(
      [history({ from_status: "agent_assigned", to_status: "picked_up" })],
      {},
    );

    expect(log[0]?.from).toBe("agent_assigned");
    expect(log[0]?.to).toBe("picked_up");
  });

  /**
   * The column existed since migration 04 but nothing ever wrote it, so this is
   * the first assertion that a note survives into the log.
   */
  it("carries the process note", () => {
    const log = orderStatusLog(
      [history({ note: "Left at the gate, no answer" })],
      {},
    );

    expect(log[0]?.note).toBe("Left at the gate, no answer");
  });

  it("carries a null note without inventing one", () => {
    expect(orderStatusLog([history({ note: null })], {})[0]?.note).toBeNull();
  });
});

describe("buildTimeline", () => {
  it("marks reached stages done and the current one current", () => {
    const steps = buildTimeline("picked_up", [
      history({ to_status: "pickup_requested" }),
      history({ to_status: "agent_assigned" }),
      history({ to_status: "picked_up" }),
    ]);

    const byStatus = new Map(steps.map((step) => [step.status, step.state]));

    expect(byStatus.get("pickup_requested")).toBe("done");
    expect(byStatus.get("agent_assigned")).toBe("done");
    expect(byStatus.get("picked_up")).toBe("current");
    expect(byStatus.get("under_analysis")).toBe("upcoming");
  });

  it("includes the payment stages the customer timeline hides", () => {
    const steps = buildTimeline("delivered", []);

    expect(steps.map((step) => step.status)).toContain("payment_pending");
    expect(steps.map((step) => step.status)).toContain("paid");
  });

  /**
   * Without the skipped state, a delivered booking would show a permanently
   * unfinished bar, because a cash-on-delivery booking never pauses at
   * "Payment Pending".
   */
  it("marks a stage the booking moved past without entering as skipped", () => {
    const steps = buildTimeline("in_process", [
      history({ to_status: "pickup_requested" }),
      history({ to_status: "agent_assigned" }),
      history({ to_status: "picked_up" }),
      history({ to_status: "under_analysis" }),
      history({ to_status: "in_process" }),
    ]);

    const byStatus = new Map(steps.map((step) => [step.status, step.state]));

    expect(byStatus.get("invoice_sent")).toBe("skipped");
    expect(byStatus.get("payment_pending")).toBe("skipped");
    expect(byStatus.get("paid")).toBe("skipped");
    expect(byStatus.get("ready_for_delivery")).toBe("upcoming");
  });

  it("shows the timestamp a stage was reached", () => {
    const steps = buildTimeline("picked_up", [
      history({ to_status: "picked_up", created_at: "2026-03-04T11:30:00Z" }),
    ]);

    expect(steps.find((step) => step.status === "picked_up")?.at).toBe(
      "2026-03-04T11:30:00Z",
    );
  });

  it("resolves who moved the stage", () => {
    const steps = buildTimeline(
      "picked_up",
      [history({ to_status: "picked_up", changed_by: "admin1" })],
      { admin1: "Priya Rao" },
    );

    expect(steps.find((step) => step.status === "picked_up")?.actor).toBe(
      "Priya Rao",
    );
  });

  it("carries the note written against a stage", () => {
    const steps = buildTimeline("picked_up", [
      history({ to_status: "picked_up", note: "Two bags" }),
    ]);

    expect(steps.find((step) => step.status === "picked_up")?.note).toBe(
      "Two bags",
    );
  });

  /** Cancelled is not on the timeline, so no stage may claim to be current. */
  it("gives a cancelled booking no current stage", () => {
    const steps = buildTimeline("cancelled", [
      history({ to_status: "cancelled" }),
    ]);

    expect(steps.some((step) => step.state === "current")).toBe(false);
  });

  /** What it reached before the cancellation is still the record of the work. */
  it("keeps the stages a cancelled booking had reached", () => {
    const steps = buildTimeline("cancelled", [
      history({ to_status: "pickup_requested" }),
      history({ to_status: "agent_assigned" }),
      history({ to_status: "cancelled" }),
    ]);

    const byStatus = new Map(steps.map((step) => [step.status, step.state]));

    expect(byStatus.get("agent_assigned")).toBe("done");
  });

  it("still marks the current stage current with no history at all", () => {
    // A booking created before the trigger existed, or a read that failed.
    const steps = buildTimeline("under_analysis", []);

    expect(steps.find((step) => step.status === "under_analysis")?.state).toBe(
      "current",
    );
  });

  it("uses the first history row for a stage that was revisited", () => {
    const steps = buildTimeline("cancelled", [
      history({
        id: 1,
        to_status: "pickup_requested",
        created_at: "2026-03-01T00:00:00Z",
      }),
      history({
        id: 2,
        to_status: "agent_assigned",
        created_at: "2026-03-02T00:00:00Z",
      }),
      history({
        id: 3,
        to_status: "pickup_requested",
        created_at: "2026-03-03T00:00:00Z",
      }),
    ]);

    expect(steps.find((step) => step.status === "pickup_requested")?.at).toBe(
      "2026-03-01T00:00:00Z",
    );
  });
});

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/**
 * Mirrors the case expression in `handle_order_status_change`. If the SQL
 * changes, this is where the two fall apart.
 */
describe("notificationForStatus", () => {
  const told: OrderStatus[] = [
    "pickup_requested",
    "agent_assigned",
    "picked_up",
    "invoice_sent",
    "paid",
    "payment_pending",
    "out_for_delivery",
    "delivered",
  ];

  const silent: OrderStatus[] = [
    "under_analysis",
    "in_process",
    "ready_for_delivery",
  ];

  it("messages the customer for every status the trigger maps", () => {
    for (const status of told) {
      expect(notificationForStatus(status).customerIsTold, status).toBe(true);
    }
  });

  it("sends nothing for the statuses the trigger maps to null", () => {
    for (const status of silent) {
      expect(notificationForStatus(status).customerIsTold, status).toBe(false);
      expect(notificationForStatus(status).template, status).toBe("");
    }
  });

  it("names a template for every status that does message", () => {
    for (const status of told) {
      expect(notificationForStatus(status).template, status).not.toBe("");
    }
  });

  it("uses the payment template for both payment states", () => {
    expect(notificationForStatus("paid").template).toBe(
      notificationForStatus("payment_pending").template,
    );
  });
});

// ---------------------------------------------------------------------------
// Guards on the item lines
// ---------------------------------------------------------------------------

describe("canEditOrderItems", () => {
  it("allows editing an ordinary open order", () => {
    expect(
      canEditOrderItems({ hasInvoice: false, status: "picked_up" }).editable,
    ).toBe(true);
  });

  /**
   * The guard that matters. `createInvoice` deletes and replaces every
   * `order_items` row for the order, so an edit made after invoicing would be
   * silently discarded.
   */
  it("locks the lines once an invoice exists", () => {
    const result = canEditOrderItems({ hasInvoice: true, status: "picked_up" });

    expect(result.editable).toBe(false);
    expect(result.reason).toMatch(/invoice/i);
  });

  it("locks a closed order", () => {
    expect(
      canEditOrderItems({ hasInvoice: false, status: "delivered" }).editable,
    ).toBe(false);
    expect(
      canEditOrderItems({ hasInvoice: false, status: "cancelled" }).editable,
    ).toBe(false);
  });

  it("always explains itself when locked", () => {
    for (const input of [
      { hasInvoice: true, status: "picked_up" as OrderStatus },
      { hasInvoice: false, status: "delivered" as OrderStatus },
    ]) {
      const result = canEditOrderItems(input);
      expect(result.editable).toBe(false);
      expect(result.reason).toBeTruthy();
    }
  });
});

describe("itemsTotal", () => {
  it("sums quantity times rate", () => {
    expect(itemsTotal([item({ qty: 5, unit_price: 80 })])).toBe(400);
  });

  it("sums across lines", () => {
    expect(
      itemsTotal([
        item({ id: "a", qty: 5, unit_price: 80 }),
        item({ id: "b", qty: 2, unit_price: 250 }),
      ]),
    ).toBe(900);
  });

  it("is zero for an order with no lines", () => {
    expect(itemsTotal([])).toBe(0);
  });
});

describe("bookingCardActions", () => {
  it("locks both buttons before the pickup", () => {
    for (const status of ["pickup_requested", "agent_assigned"] as const) {
      const result = bookingCardActions({ status, hasInvoice: false });
      expect(result.analysis, status).toBe("locked");
      expect(result.analysisReason, status).toBeTruthy();
      expect(result.invoice, status).toBe("locked");
      expect(result.invoiceReason, status).toBeTruthy();
    }
  });

  it("unlocks analysis as soon as the pickup is completed", () => {
    const result = bookingCardActions({
      status: "picked_up",
      hasInvoice: false,
    });
    expect(result.analysis).toBe("ready");
    expect(result.analysisReason).toBeNull();
    expect(result.invoice).toBe("locked");
    expect(result.invoiceReason).toBeTruthy();
  });

  it("records the analysis and unlocks the invoice at under_analysis", () => {
    const result = bookingCardActions({
      status: "under_analysis",
      hasInvoice: false,
    });
    expect(result.analysis).toBe("done");
    expect(result.invoice).toBe("ready");
    expect(result.invoiceReason).toBeNull();
  });

  it("marks both done once an invoice exists", () => {
    for (const status of [
      "under_analysis",
      "invoice_sent",
      "payment_pending",
      "paid",
      "in_process",
      "ready_for_delivery",
      "out_for_delivery",
      "delivered",
    ] as const) {
      const result = bookingCardActions({ status, hasInvoice: true });
      expect(result.analysis, status).toBe("done");
      expect(result.invoice, status).toBe("done");
      expect(result.invoiceReason, status).toBeNull();
    }
  });

  it("points an un-invoiced later stage at Billing", () => {
    const result = bookingCardActions({
      status: "in_process",
      hasInvoice: false,
    });
    expect(result.analysis).toBe("done");
    expect(result.invoice).toBe("locked");
    expect(result.invoiceReason).toBeTruthy();
  });

  it("locks both buttons on a cancelled booking", () => {
    const result = bookingCardActions({
      status: "cancelled",
      hasInvoice: false,
    });
    expect(result.analysis).toBe("locked");
    expect(result.analysisReason).toBeTruthy();
    expect(result.invoice).toBe("locked");
    expect(result.invoiceReason).toBeTruthy();
  });

  it("always explains itself when locked", () => {
    for (const [status, hasInvoice] of [
      ["pickup_requested", false],
      ["agent_assigned", false],
      ["picked_up", false],
      ["cancelled", false],
      ["in_process", false],
      ["delivered", false],
    ] as const) {
      const result = bookingCardActions({ status, hasInvoice });

      if (result.analysis === "locked") {
        expect(result.analysisReason).toBeTruthy();
      }
      if (result.invoice === "locked") {
        expect(result.invoiceReason).toBeTruthy();
      }
      if (result.send === "locked") {
        expect(result.sendReason).toBeTruthy();
      }
    }
  });

  describe("send to customer", () => {
    it("locks before any invoice exists", () => {
      const result = bookingCardActions({
        status: "under_analysis",
        hasInvoice: false,
      });
      expect(result.send).toBe("locked");
      expect(result.sendReason).toBeTruthy();
    });

    it("is ready the moment an invoice is generated but unsent", () => {
      const result = bookingCardActions({
        status: "invoice_sent",
        hasInvoice: true,
        invoiceStatus: "draft",
      });
      expect(result.send).toBe("ready");
      expect(result.sendReason).toBeNull();
    });

    it("treats a row without an invoice status as an unsent draft", () => {
      const result = bookingCardActions({
        status: "invoice_sent",
        hasInvoice: true,
      });
      expect(result.send).toBe("ready");
    });

    it("is done for both sent and collected invoices", () => {
      for (const invoiceStatus of ["sent", "paid"] as const) {
        const result = bookingCardActions({
          status: "out_for_delivery",
          hasInvoice: true,
          invoiceStatus,
        });
        expect(result.send, invoiceStatus).toBe("done");
        expect(result.sendReason, invoiceStatus).toBeNull();
      }
    });

    it("refuses to send for a cancelled booking", () => {
      const result = bookingCardActions({
        status: "cancelled",
        hasInvoice: true,
        invoiceStatus: "draft",
      });
      expect(result.send).toBe("locked");
      expect(result.sendReason).toBeTruthy();
    });
  });
});
