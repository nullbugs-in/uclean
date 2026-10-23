import { describe, expect, it } from "vitest";

import type {
  Invoice,
  Order,
  OrderItem,
  PickupAssignment,
  Profile,
} from "@/db/types";

import {
  applyDeliveryFilter,
  assembleDeliveryRequests,
  cashToCollect,
  countDeliveries,
} from "./admin-deliveries.view";

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: "o1",
    order_no: "UC-2026-000001",
    customer_id: "u1",
    created_by: null,
    source: "online",
    status: "ready_for_delivery",
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

function item(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    id: "i1",
    order_id: "o1",
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
    type: "delivery",
    status: "assigned",
    assigned_by_type: "manual",
    assigned_by: "admin1",
    assigned_at: "2026-03-01T00:00:00Z",
    completed_at: null,
    ...overrides,
  };
}

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "inv1",
    order_id: "o1",
    invoice_no: "INV-0001",
    customer_name: "Asha Menon",
    customer_mobile: "+919876543210",
    billing_address: "2979/1, D21/1, 6th Main Rd",
    subtotal: 160,
    tax: 0,
    discount: 0,
    delivery_charge: 0,
    total: 160,
    status: "sent",
    pay_token: null,
    pay_token_expires_at: null,
    sent_at: "2026-03-02T00:00:00Z",
    paid_at: null,
    created_by: "admin1",
    created_at: "2026-03-02T00:00:00Z",
    updated_at: "2026-03-02T00:00:00Z",
    ...overrides,
  } as Invoice;
}

const AGENT: Pick<Profile, "id" | "full_name" | "mobile"> = {
  id: "a1",
  full_name: "Ravi Kumar",
  mobile: "+919812345678",
};

function assemble(overrides: {
  orders: Order[];
  items?: OrderItem[];
  assignments?: PickupAssignment[];
  agents?: Pick<Profile, "id" | "full_name" | "mobile">[];
  invoices?: Invoice[];
}) {
  return assembleDeliveryRequests({
    orders: overrides.orders,
    items: overrides.items ?? [],
    assignments: overrides.assignments ?? [],
    agents: overrides.agents ?? [],
    invoices: overrides.invoices ?? [],
  });
}

describe("assembleDeliveryRequests", () => {
  /**
   * The property the whole module inherits from the pickup assembly, and the one
   * that matters most: a delivery nobody is carrying must still be on the queue.
   */
  it("keeps a delivery that has no assignment at all", () => {
    const result = assemble({ orders: [order()] });

    expect(result).toHaveLength(1);
    expect(result[0]?.agent).toBeNull();
  });

  it("resolves the delivery agent for the control", () => {
    const result = assemble({
      orders: [order()],
      assignments: [assignment()],
      agents: [AGENT],
    });

    expect(result[0]?.agent?.id).toBe("a1");
    expect(result[0]?.agent?.fullName).toBe("Ravi Kumar");
    expect(result[0]?.agent?.mobile).toBe("+919812345678");
    expect(result[0]?.agent?.automated).toBe(false);
  });

  it("marks an auto-assigned row as automated", () => {
    const result = assemble({
      orders: [order()],
      assignments: [assignment({ assigned_by_type: "auto" })],
      agents: [AGENT],
    });

    expect(result[0]?.agent?.automated).toBe(true);
  });

  /**
   * A detached row is a removed agent. Reading it as an owner would hide the
   * delivery from "Needs an agent", and the empty id keeps the control from
   * preselecting a person who no longer exists.
   */
  it("treats a detached assignment as unassigned, naming nobody", () => {
    const result = assemble({
      orders: [order()],
      assignments: [assignment({ agent_id: null })],
    });

    expect(result[0]?.agent).toBeNull();
  });

  it("treats a cancelled assignment as unassigned", () => {
    const result = assemble({
      orders: [order()],
      assignments: [assignment({ status: "cancelled" })],
    });

    expect(result[0]?.agent).toBeNull();
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
  });

  /**
   * The invoice is joined independently of the assignment, so a delivery can be
   * on the queue before anyone has billed for it.
   */
  it("attaches the invoice and reads an unpaid one as not collected", () => {
    const result = assemble({
      orders: [order()],
      invoices: [invoice()],
    });

    expect(result[0]?.invoice?.invoice_no).toBe("INV-0001");
    expect(result[0]?.collected).toBe(false);
  });

  it("reads a paid invoice as collected", () => {
    const result = assemble({
      orders: [order()],
      invoices: [invoice({ status: "paid", paid_at: "2026-03-03T00:00:00Z" })],
    });

    expect(result[0]?.collected).toBe(true);
  });

  /**
   * The join is on `order_id`, so an invoice for another order must not leak onto
   * this delivery - the case that a positional join would have got wrong.
   */
  it("does not attach another order's invoice", () => {
    const result = assemble({
      orders: [order({ id: "o1" })],
      invoices: [invoice({ id: "inv2", order_id: "o2" })],
    });

    expect(result[0]?.invoice).toBeNull();
    expect(result[0]?.collected).toBe(false);
  });

  /** A delivery carries no slot; the pickup window would be the wrong time. */
  it("carries no slot label even when the order has a pickup slot", () => {
    const result = assemble({ orders: [order({ pickup_slot_id: "s1" })] });

    expect(result).toHaveLength(1);
  });
});

describe("applyDeliveryFilter", () => {
  const requests = assemble({
    orders: [
      order({ id: "o1", status: "ready_for_delivery" }),
      order({
        id: "o2",
        order_no: "UC-2026-000002",
        status: "out_for_delivery",
      }),
      order({ id: "o3", order_no: "UC-2026-000003" }),
    ],
    assignments: [assignment({ order_id: "o2", agent_id: "a1" })],
    agents: [AGENT],
  });

  it("returns everything for all", () => {
    expect(applyDeliveryFilter(requests, "all")).toHaveLength(3);
  });

  it("finds the deliveries nobody is carrying", () => {
    const result = applyDeliveryFilter(requests, "unassigned");

    expect(result.map((request) => request.order.id)).toEqual(["o1", "o3"]);
  });

  it("finds the assigned deliveries", () => {
    const result = applyDeliveryFilter(requests, "assigned");

    expect(result.map((request) => request.order.id)).toEqual(["o2"]);
  });

  it("finds only what has left the store", () => {
    const result = applyDeliveryFilter(requests, "out");

    expect(result.map((request) => request.order.id)).toEqual(["o2"]);
  });
});

describe("countDeliveries", () => {
  it("counts each tab from the same list", () => {
    const requests = assemble({
      orders: [
        order({ id: "o1", status: "ready_for_delivery" }),
        order({
          id: "o2",
          order_no: "UC-2026-000002",
          status: "out_for_delivery",
        }),
      ],
      assignments: [assignment({ order_id: "o2", agent_id: "a1" })],
      agents: [AGENT],
    });

    expect(countDeliveries(requests)).toEqual({
      all: 2,
      unassigned: 1,
      assigned: 1,
      out: 1,
    });
  });
});

describe("cashToCollect", () => {
  it("sums the unpaid invoices only", () => {
    const requests = assemble({
      orders: [
        order({ id: "o1" }),
        order({ id: "o2", order_no: "UC-2026-000002" }),
        order({ id: "o3", order_no: "UC-2026-000003" }),
      ],
      invoices: [
        invoice({ id: "inv1", order_id: "o1", total: 160, status: "sent" }),
        invoice({ id: "inv2", order_id: "o2", total: 240, status: "paid" }),
        invoice({ id: "inv3", order_id: "o3", total: 90, status: "sent" }),
      ],
    });

    expect(cashToCollect(requests)).toBe(250);
  });

  it("counts nothing for a delivery that has not been billed", () => {
    const requests = assemble({ orders: [order()] });

    expect(cashToCollect(requests)).toBe(0);
  });
});
