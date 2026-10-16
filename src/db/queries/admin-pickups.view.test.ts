import { describe, expect, it } from "vitest";

import type {
  Order,
  OrderItem,
  PickupAssignment,
  Profile,
  TimeSlot,
} from "@/db/types";

import {
  addDaysKey,
  applyPickupFilter,
  assemblePickupRequests,
  countPickups,
  dayHeading,
  groupPickupsByAgent,
  groupPickupsByDay,
  hasUsableCoordinates,
  isToday,
  slotLabelOf,
  type PickupAgent,
  type PickupRequest,
} from "./admin-pickups.view";

const TODAY = "2026-03-10";

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: "o1",
    order_no: "UC-2026-000001",
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
    pickup_slot_date: TODAY,
    pickup_slot_id: "s1",
    delivery_slot_date: null,
    delivery_slot_id: null,
    accepted_zone_notice_at: "2026-03-01T00:00:00Z",
    notes: "Gate code 1234",
    cancellation_reason: null,
    payment_mode: "cod",
    created_at: "2026-03-01T00:00:00Z",
    updated_at: "2026-03-01T00:00:00Z",
    ...overrides,
  } as Order;
}

function item(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    id: "i1",
    order_id: "o1",
    service_id: null,
    item_name: "Wash and Iron",
    qty: 2,
    unit_price: 80,
    notes: null,
    photo_url: null,
    ...overrides,
  } as OrderItem;
}

function assignment(
  overrides: Partial<PickupAssignment> = {},
): PickupAssignment {
  return {
    id: "pa1",
    order_id: "o1",
    agent_id: "a1",
    type: "pickup",
    status: "assigned",
    assigned_by_type: "manual",
    assigned_by: "admin1",
    assigned_at: "2026-03-01T00:00:00Z",
    completed_at: null,
    ...overrides,
  };
}

function slot(overrides: Partial<TimeSlot> = {}): TimeSlot {
  return {
    id: "s1",
    start_time: "10:00",
    end_time: "11:00",
    label: null,
    capacity: 9,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as TimeSlot;
}

function assemble(overrides: {
  orders: Order[];
  items?: OrderItem[];
  slots?: TimeSlot[];
  assignments?: PickupAssignment[];
  agents?: Pick<Profile, "id" | "full_name" | "mobile">[];
}) {
  return assemblePickupRequests({
    orders: overrides.orders,
    items: overrides.items ?? [],
    slots: overrides.slots ?? [],
    assignments: overrides.assignments ?? [],
    agents: overrides.agents ?? [],
  });
}

describe("assemblePickupRequests", () => {
  /**
   * The whole reason this module exists. The staff list this page used to render
   * was driven off `pickup_assignments`, so a request nobody had picked up yet
   * never appeared — which is exactly the set an admin opens this page to act on.
   */
  it("keeps an order that has no assignment at all", () => {
    const result = assemble({ orders: [order()] });

    expect(result).toHaveLength(1);
    expect(result[0]?.assignment).toBeNull();
    expect(result[0]?.agentName).toBeNull();
  });

  it("keeps every order regardless of how many are assigned", () => {
    const result = assemble({
      orders: [
        order({ id: "o1" }),
        order({ id: "o2", order_no: "UC-2026-000002" }),
        order({ id: "o3", order_no: "UC-2026-000003" }),
      ],
      assignments: [assignment({ order_id: "o2", agent_id: "a1" })],
    });

    expect(result.map((r) => r.order.id)).toEqual(["o1", "o2", "o3"]);
    expect(result.filter((r) => r.assignment === null)).toHaveLength(2);
  });

  it("resolves the agent name for display", () => {
    const result = assemble({
      orders: [order()],
      assignments: [assignment()],
      agents: [{ id: "a1", full_name: "Ravi Kumar", mobile: "+919812345678" }],
    });

    expect(result[0]?.agentName).toBe("Ravi Kumar");
    expect(result[0]?.agentMobile).toBe("+919812345678");
  });

  /**
   * A cancelled assignment is history, not an owner. Reading it as one would hide
   * the request from the "Needs an agent" filter and leave nobody to pick it up.
   */
  it("treats a cancelled assignment as unassigned", () => {
    const result = assemble({
      orders: [order()],
      assignments: [assignment({ status: "cancelled" })],
    });

    expect(result[0]?.assignment).toBeNull();
  });

  /**
   * Agent removal nulls `agent_id` and keeps the row as history. Such a row is
   * nobody's pickup, so it must read as unassigned — otherwise it disappears
   * from the "Needs an agent" filter while going unworked.
   */
  it("treats a detached assignment as unassigned", () => {
    const result = assemble({
      orders: [order()],
      assignments: [assignment({ agent_id: null })],
    });

    expect(result[0]?.assignment).toBeNull();
    expect(result[0]?.agentName).toBeNull();
  });

  it("collects the items belonging to each order", () => {
    const result = assemble({
      orders: [
        order({ id: "o1" }),
        order({ id: "o2", order_no: "UC-2026-000002" }),
      ],
      items: [
        item({ id: "i1", order_id: "o1" }),
        item({ id: "i2", order_id: "o1", item_name: "Dry Cleaning" }),
        item({ id: "i3", order_id: "o2", item_name: "Shoe Cleaning" }),
      ],
    });

    expect(result[0]?.items).toHaveLength(2);
    expect(result[1]?.items).toHaveLength(1);
    expect(result[1]?.items[0]?.item_name).toBe("Shoe Cleaning");
  });

  it("gives an order no items rather than throwing", () => {
    const result = assemble({ orders: [order()] });

    expect(result[0]?.items).toEqual([]);
  });

  it("renders the slot label from the slot row", () => {
    const result = assemble({ orders: [order()], slots: [slot()] });

    expect(result[0]?.slotLabel).toBe("10:00 AM - 11:00 AM");
  });

  it("survives a slot row that has since been deleted", () => {
    const result = assemble({ orders: [order()] });

    expect(result[0]?.slotLabel).toBeNull();
  });

  it("does not leak one order's items onto another", () => {
    const result = assemble({
      orders: [
        order({ id: "o1" }),
        order({ id: "o2", order_no: "UC-2026-000002" }),
      ],
      items: [item({ order_id: "o2" })],
    });

    expect(result[0]?.items).toHaveLength(0);
    expect(result[1]?.items).toHaveLength(1);
  });
});

describe("slotLabelOf", () => {
  it("prefers an explicit label", () => {
    expect(slotLabelOf(slot({ label: "Morning slot" }))).toBe("Morning slot");
  });

  it("formats 24 hour times into 12 hour ones", () => {
    expect(slotLabelOf(slot({ start_time: "13:00", end_time: "14:00" }))).toBe(
      "1:00 PM - 2:00 PM",
    );
  });

  it("renders midnight and noon correctly", () => {
    expect(slotLabelOf(slot({ start_time: "00:00", end_time: "12:00" }))).toBe(
      "12:00 AM - 12:00 PM",
    );
  });
});

describe("applyPickupFilter", () => {
  const requests: PickupRequest[] = [
    {
      order: order({ id: "o1" }),
      items: [],
      slotLabel: null,
      assignment: null,
      agentName: null,
      agentMobile: null,
    },
    {
      order: order({
        id: "o2",
        order_no: "UC-2026-000002",
        pickup_slot_date: "2026-03-14",
      }),
      items: [],
      slotLabel: null,
      assignment: { agent_id: "a1" } as PickupRequest["assignment"],
      agentName: "Ravi Kumar",
      agentMobile: null,
    },
  ];

  it("shows everything under All", () => {
    expect(applyPickupFilter(requests, "all", TODAY)).toHaveLength(2);
  });

  it("shows only the ones nobody has taken", () => {
    const result = applyPickupFilter(requests, "unassigned", TODAY);
    expect(result.map((r) => r.order.id)).toEqual(["o1"]);
  });

  it("shows only the assigned ones", () => {
    const result = applyPickupFilter(requests, "assigned", TODAY);
    expect(result.map((r) => r.order.id)).toEqual(["o2"]);
  });

  it("shows only today's slot date, not the booking date", () => {
    const result = applyPickupFilter(requests, "today", TODAY);
    expect(result.map((r) => r.order.id)).toEqual(["o1"]);
  });

  it("falls back to everything for an unknown filter", () => {
    expect(
      applyPickupFilter(requests, "nonsense" as never, TODAY),
    ).toHaveLength(2);
  });
});

describe("countPickups", () => {
  it("counts each tab from the same list it filters", () => {
    const requests: PickupRequest[] = [
      {
        order: order({ id: "o1" }),
        items: [],
        slotLabel: null,
        assignment: null,
        agentName: null,
        agentMobile: null,
      },
      {
        order: order({ id: "o2", order_no: "UC-2026-000002" }),
        items: [],
        slotLabel: null,
        assignment: { agent_id: "a1" } as PickupRequest["assignment"],
        agentName: "Ravi",
        agentMobile: null,
      },
    ];

    expect(countPickups(requests, TODAY)).toEqual({
      all: 2,
      unassigned: 1,
      assigned: 1,
      today: 2,
    });
  });
});

describe("groupPickupsByDay", () => {
  it("groups by slot date, oldest first", () => {
    const requests: PickupRequest[] = [
      {
        order: order({ id: "o1", pickup_slot_date: "2026-03-12" }),
        items: [],
        slotLabel: null,
        assignment: null,
        agentName: null,
        agentMobile: null,
      },
      {
        order: order({ id: "o2", pickup_slot_date: "2026-03-10" }),
        items: [],
        slotLabel: null,
        assignment: null,
        agentName: null,
        agentMobile: null,
      },
      {
        order: order({ id: "o3", pickup_slot_date: "2026-03-10" }),
        items: [],
        slotLabel: null,
        assignment: null,
        agentName: null,
        agentMobile: null,
      },
    ];

    const days = groupPickupsByDay(requests);

    expect(days.map((d) => d.dateKey)).toEqual(["2026-03-10", "2026-03-12"]);
    expect(days[0]?.requests).toHaveLength(2);
  });

  it("returns nothing for an empty queue", () => {
    expect(groupPickupsByDay([])).toEqual([]);
  });
});

describe("hasUsableCoordinates", () => {
  it("rejects the null island sentinel", () => {
    expect(hasUsableCoordinates(0, 0)).toBe(false);
  });

  it("rejects a missing point", () => {
    expect(hasUsableCoordinates(null, 77.59)).toBe(false);
  });

  it("accepts a real point", () => {
    expect(hasUsableCoordinates(12.97, 77.59)).toBe(true);
  });
});

describe("addDaysKey", () => {
  it("rolls forward across a month boundary", () => {
    expect(addDaysKey("2026-03-31", 1)).toBe("2026-04-01");
  });

  it("rolls back across a year boundary", () => {
    expect(addDaysKey("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("zero-pads single digit months and days", () => {
    expect(addDaysKey("2026-03-01", 1)).toBe("2026-03-02");
  });
});

/**
 * The queue is read for "what is mine today", so the near days are named rather
 * than dated. Getting this wrong makes the busiest group on the screen the
 * hardest to find.
 */
describe("dayHeading", () => {
  it("names today", () => {
    expect(dayHeading("2026-03-10", "2026-03-10")).toBe("Today");
  });

  it("names tomorrow", () => {
    expect(dayHeading("2026-03-11", "2026-03-10")).toBe("Tomorrow");
  });

  it("falls back to a weekday and date further out", () => {
    const heading = dayHeading("2026-03-14", "2026-03-10");

    expect(heading).not.toBe("Today");
    expect(heading).not.toBe("Tomorrow");
    expect(heading).toContain("14");
  });

  it("does not call tomorrow today across a month boundary", () => {
    expect(dayHeading("2026-04-01", "2026-03-31")).toBe("Tomorrow");
  });

  it("handles a year boundary", () => {
    expect(dayHeading("2026-01-01", "2025-12-31")).toBe("Tomorrow");
  });
});

describe("isToday", () => {
  it("is true only for the given day", () => {
    expect(isToday("2026-03-10", "2026-03-10")).toBe(true);
    expect(isToday("2026-03-11", "2026-03-10")).toBe(false);
  });
});

function agent(overrides: Partial<PickupAgent> = {}): PickupAgent {
  return {
    id: "a1",
    fullName: "Ravi Kumar",
    mobile: "+919812345678",
    zone: null,
    isAvailable: true,
    currentLoad: 0,
    vehicle: null,
    ...overrides,
  };
}

function request(
  id: string,
  agentId: string | null,
  dateKey = TODAY,
  slotLabel: string | null = "10:00 AM - 11:00 AM",
): PickupRequest {
  return {
    order: order({ id, order_no: `UC-${id}`, pickup_slot_date: dateKey }),
    items: [],
    slotLabel,
    assignment:
      agentId === null
        ? null
        : { ...assignment({ order_id: id, agent_id: agentId }) },
    agentName: null,
    agentMobile: null,
  };
}

describe("groupPickupsByAgent", () => {
  /**
   * Half the point of this view. A roster of only busy agents cannot answer
   * "who can take one more", which is the question asked before pressing
   * auto-assign.
   */
  it("includes an agent with nothing assigned", () => {
    const result = groupPickupsByAgent([], [agent({ id: "a1" })], TODAY);

    expect(result).toHaveLength(1);
    expect(result[0]?.isFree).toBe(true);
    expect(result[0]?.requests).toEqual([]);
  });

  it("groups pickups under the agent holding them", () => {
    const result = groupPickupsByAgent(
      [request("o1", "a1"), request("o2", "a1"), request("o3", "a2")],
      [agent({ id: "a1" }), agent({ id: "a2" })],
      TODAY,
    );

    const first = result.find((entry) => entry.agent.id === "a1");
    const second = result.find((entry) => entry.agent.id === "a2");

    expect(first?.requests).toHaveLength(2);
    expect(second?.requests).toHaveLength(1);
  });

  it("ignores unassigned pickups, which belong to the queue view", () => {
    const result = groupPickupsByAgent(
      [request("o1", null), request("o2", "a1")],
      [agent({ id: "a1" })],
      TODAY,
    );

    expect(result[0]?.requests).toHaveLength(1);
  });

  it("puts the busiest agent first", () => {
    const result = groupPickupsByAgent(
      [request("o1", "quiet"), request("o2", "busy"), request("o3", "busy")],
      [
        agent({ id: "quiet", fullName: "Quiet Agent" }),
        agent({ id: "busy", fullName: "Busy Agent" }),
      ],
      TODAY,
    );

    expect(result[0]?.agent.id).toBe("busy");
  });

  it("breaks a tie alphabetically so the order is stable", () => {
    const result = groupPickupsByAgent(
      [],
      [
        agent({ id: "a2", fullName: "Zoe Ahmed" }),
        agent({ id: "a1", fullName: "Asha Menon" }),
      ],
      TODAY,
    );

    expect(result.map((entry) => entry.agent.fullName)).toEqual([
      "Asha Menon",
      "Zoe Ahmed",
    ]);
  });

  it("counts only today's pickups as today", () => {
    const result = groupPickupsByAgent(
      [request("o1", "a1", TODAY), request("o2", "a1", "2026-03-14")],
      [agent({ id: "a1" })],
      TODAY,
    );

    expect(result[0]?.todayCount).toBe(1);
    expect(result[0]?.requests).toHaveLength(2);
  });

  it("lists the slot times they are on, earliest day first", () => {
    const result = groupPickupsByAgent(
      [
        request("o1", "a1", "2026-03-14", "1:00 PM - 2:00 PM"),
        request("o2", "a1", TODAY, "10:00 AM - 11:00 AM"),
      ],
      [agent({ id: "a1" })],
      TODAY,
    );

    expect(result[0]?.slotTimes).toEqual([
      "10:00 AM - 11:00 AM",
      "1:00 PM - 2:00 PM",
    ]);
  });

  it("falls back to a label when the slot row has gone", () => {
    const result = groupPickupsByAgent(
      [request("o1", "a1", TODAY, null)],
      [agent({ id: "a1" })],
      TODAY,
    );

    expect(result[0]?.slotTimes).toEqual(["No slot"]);
  });

  it("reports no carried load when the two counts agree", () => {
    const result = groupPickupsByAgent(
      [request("o1", "a1"), request("o2", "a1")],
      [agent({ id: "a1", currentLoad: 2 })],
      TODAY,
    );

    expect(result[0]?.carriedLoad).toBe(0);
  });

  /**
   * `agents.current_load` is maintained by a trigger and counts every open
   * assignment, while this view only shows what is still an open pickup. The gap
   * is work whose order has moved on, and seeing it is the point.
   */
  it("surfaces load the board does not show", () => {
    const result = groupPickupsByAgent(
      [request("o1", "a1")],
      [agent({ id: "a1", currentLoad: 4 })],
      TODAY,
    );

    expect(result[0]?.carriedLoad).toBe(3);
  });

  it("never reports negative carried load", () => {
    // A stale current_load below what is actually on the board would otherwise
    // render as "less than nothing".
    const result = groupPickupsByAgent(
      [request("o1", "a1"), request("o2", "a1")],
      [agent({ id: "a1", currentLoad: 0 })],
      TODAY,
    );

    expect(result[0]?.carriedLoad).toBe(0);
  });
});
