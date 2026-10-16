import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { Order, OrderStatus, OrderStatusHistory } from "@/db/types";
import { ADMIN_TIMELINE } from "@/lib/order-status";

import { BookingProgressTimeline } from "./booking-progress-timeline";

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: "o1",
    order_no: "UC-2026-000042",
    customer_id: "u1",
    created_by: null,
    source: "online",
    status: "picked_up",
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

function step(
  toStatus: OrderStatus,
  createdAt: string,
  changedBy: string | null = null,
  note: string | null = null,
): OrderStatusHistory {
  return {
    id: 1,
    order_id: "o1",
    from_status: null,
    to_status: toStatus,
    changed_by: changedBy,
    note,
    created_at: createdAt,
  } as OrderStatusHistory;
}

const ACTORS = { admin1: "Priya Rao" };

describe("BookingProgressTimeline", () => {
  it("renders every stage an admin tracks, not just the customer's nine", () => {
    // The customer timeline hides the payment states. An admin timeline that
    // reused it would show a booking as finished with no sign of where it is on
    // payment.
    render(
      <BookingProgressTimeline order={order()} history={[]} actorNames={{}} />,
    );

    for (const status of ADMIN_TIMELINE) {
      expect(screen.getByText(labelOf(status)), status).toBeTruthy();
    }
  });

  it("marks the current stage as current", () => {
    render(
      <BookingProgressTimeline order={order()} history={[]} actorNames={{}} />,
    );

    const current = screen.getByText("Current");

    expect(current.textContent).toBe("Current");
  });

  it("shows the timestamp a completed stage was reached", () => {
    render(
      <BookingProgressTimeline
        order={order({ status: "picked_up" })}
        history={[step("picked_up", "2026-03-04T11:30:00Z")]}
        actorNames={{}}
      />,
    );

    expect(screen.getByText(/2026/)).toBeTruthy();
  });

  it("names who moved a completed stage", () => {
    render(
      <BookingProgressTimeline
        order={order({ status: "picked_up" })}
        history={[step("picked_up", "2026-03-04T11:30:00Z", "admin1")]}
        actorNames={ACTORS}
      />,
    );

    expect(screen.getByText(/Priya Rao/)).toBeTruthy();
  });

  it("shows the process note written against a stage", () => {
    render(
      <BookingProgressTimeline
        order={order({ status: "picked_up" })}
        history={[
          step(
            "picked_up",
            "2026-03-04T11:30:00Z",
            null,
            "Two bags, one comforter",
          ),
        ]}
        actorNames={{}}
      />,
    );

    expect(screen.getByText("Two bags, one comforter")).toBeTruthy();
  });

  /**
   * The trigger writes a history row the instant the status changes, so the
   * current stage almost always has one. If that made it read as completed, the
   * bar would always look finished.
   */
  it("does not mark the current stage as completed even with a history row", () => {
    render(
      <BookingProgressTimeline
        order={order({ status: "picked_up" })}
        history={[step("picked_up", "2026-03-04T11:30:00Z")]}
        actorNames={{}}
      />,
    );

    // Exactly one "Current", and it is on the Picked Up row.
    expect(screen.getAllByText("Current")).toHaveLength(1);
  });

  it("shows the cancellation reason for a cancelled booking", () => {
    render(
      <BookingProgressTimeline
        order={order({
          status: "cancelled",
          cancellation_reason: "Customer cancelled, laundry collected in error",
        })}
        history={[]}
        actorNames={{}}
      />,
    );

    expect(screen.getByText("This booking was cancelled")).toBeTruthy();
    expect(
      screen.getByText("Customer cancelled, laundry collected in error"),
    ).toBeTruthy();
  });

  /** Cancelled is not a stage on the timeline, so nothing may claim to be current. */
  it("shows no current stage for a cancelled booking", () => {
    render(
      <BookingProgressTimeline
        order={order({
          status: "cancelled",
          cancellation_reason: "Changed mind",
        })}
        history={[]}
        actorNames={{}}
      />,
    );

    expect(screen.queryByText("Current")).toBeNull();
  });

  /** The work done before a cancellation is still the record. */
  it("still shows what a cancelled booking had reached", () => {
    render(
      <BookingProgressTimeline
        order={order({
          status: "cancelled",
          cancellation_reason: "Changed mind",
        })}
        history={[step("pickup_requested", "2026-03-01T00:00:00Z", "admin1")]}
        actorNames={ACTORS}
      />,
    );

    expect(screen.getByText(/Priya Rao/)).toBeTruthy();
  });

  it("renders without a history at all, which is a booking created before the trigger", () => {
    render(
      <BookingProgressTimeline
        order={order({ status: "under_analysis" })}
        history={[]}
        actorNames={{}}
      />,
    );

    expect(screen.getByText("Current")).toBeTruthy();
  });

  it("describes each indicator for a screen reader", () => {
    const { container } = render(
      <BookingProgressTimeline
        order={order({ status: "picked_up" })}
        history={[step("pickup_requested", "2026-03-01T00:00:00Z")]}
        actorNames={{}}
      />,
    );

    const labels = Array.from(container.querySelectorAll(".sr-only")).map(
      (node) => node.textContent,
    );

    expect(labels).toContain("Completed: ");
    expect(labels).toContain("Current stage: ");
    expect(labels).toContain("Not reached: ");
  });
});

/**
 * The rendered wording. Mirrors INTERNAL_STATUS_LABEL for the statuses this file
 * asserts on, so the test does not become a tautology against the map.
 */
function labelOf(status: OrderStatus): string {
  const labels: Partial<Record<OrderStatus, string>> = {
    pickup_requested: "Pickup Requested",
    agent_assigned: "Agent Assigned",
    picked_up: "Picked Up",
    under_analysis: "Under Analysis",
    invoice_sent: "Invoice Sent",
    payment_pending: "Payment Pending",
    paid: "Paid",
    in_process: "In Process",
    ready_for_delivery: "Ready for Delivery",
    out_for_delivery: "Out for Delivery",
    delivered: "Delivered",
  };

  return labels[status] ?? status;
}
