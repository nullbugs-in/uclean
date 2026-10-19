import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Order, OrderStatusHistory } from "@/db/types";

import { OrderTrackingList } from "./order-tracking-list";

/**
 * Deep-linking from a notification to one booking.
 *
 * The behaviour worth protecting: arriving from the bell must leave the right
 * order already expanded, or the tap saved the customer nothing. It is also the
 * part most easily broken by a well-meaning refactor of the expand state, since
 * `openId` starting as `null` looks perfectly reasonable on its own.
 */

const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";

function order(overrides: Partial<Order> & { id: string }): Order {
  return {
    order_no: "UC-1001",
    customer_id: "c1",
    source: "online",
    status: "picked_up",
    address_snapshot: "12 MG Road, Bengaluru",
    distance_m: 1200,
    pickup_slot_date: "2026-03-10",
    pickup_slot_id: "s1",
    delivery_slot_id: null,
    created_at: "2026-03-01T00:00:00.000Z",
    updated_at: "2026-03-01T00:00:00.000Z",
    ...overrides,
  } as Order;
}

function history(orderId: string): OrderStatusHistory[] {
  return [
    {
      id: 1,
      order_id: orderId,
      from_status: "pickup_requested",
      to_status: "picked_up",
      changed_by: null,
      note: null,
      created_at: "2026-03-02T00:00:00.000Z",
    },
  ];
}

const ORDERS = [
  order({ id: ORDER_ID, order_no: "UC-1001" }),
  order({ id: OTHER_ID, order_no: "UC-1002", status: "delivered" }),
];

function list(trackedOrderId?: string | null) {
  return render(
    <OrderTrackingList
      orders={ORDERS}
      history={{ [ORDER_ID]: history(ORDER_ID) }}
      trackedOrderId={trackedOrderId}
    />,
  );
}

describe("OrderTrackingList deep link", () => {
  it("leaves every booking collapsed when no order is tracked", () => {
    list(null);

    expect(
      screen.getAllByRole("button", { name: /Track order/i }),
    ).toHaveLength(2);
  });

  it("starts the tracked order expanded", () => {
    list(ORDER_ID);

    // Exactly one booking is open, and it is the one that was tracked.
    expect(
      screen.getByRole("button", { name: /Hide tracking/i }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /Track order/i }),
    ).toHaveLength(1);
  });

  it("anchors every booking so a deep link can scroll to one", () => {
    list(ORDER_ID);

    // The id is the contract with the bell's scrollIntoView; if it changes,
    // arriving from a notification silently stops scrolling anywhere.
    expect(document.getElementById(`order-${ORDER_ID}`)).not.toBeNull();
    expect(document.getElementById(`order-${OTHER_ID}`)).not.toBeNull();
  });

  it("leaves everything collapsed for an id that is not in the list", () => {
    // A message about an order the customer can no longer see - the list is
    // filtered to their own orders - must not half-open anything.
    list("33333333-3333-4333-8333-333333333333");

    expect(
      screen.getAllByRole("button", { name: /Track order/i }),
    ).toHaveLength(2);
  });
});
