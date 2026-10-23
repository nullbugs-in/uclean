import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OrderTimeline } from "@/components/order-timeline";
import type { OrderStatusHistory } from "@/db/types";

function history(
  entries: Array<
    [OrderStatusHistory["from_status"], OrderStatusHistory["to_status"]]
  >,
): OrderStatusHistory[] {
  return entries.map(([from, to], index) => ({
    id: index + 1,
    order_id: "order-1",
    from_status: from,
    to_status: to,
    changed_by: null,
    note: null,
    created_at: `2026-01-15T0${index}:00:00.000Z`,
  }));
}

describe("OrderTimeline", () => {
  it("renders every customer step in order", () => {
    render(<OrderTimeline status="under_analysis" history={history([])} />);

    const steps = screen
      .getAllByRole("listitem")
      .map((item) => item.textContent);
    expect(steps[0]).toContain("Pickup Scheduled");
    expect(steps[1]).toContain("Agent Assigned");
    expect(steps[2]).toContain("Product Analysis");
    expect(steps.at(-1)).toContain("Delivered");
  });

  it("hides the collection handover from the tracked steps", () => {
    render(<OrderTimeline status="under_analysis" history={history([])} />);

    // "Picked Up" is not a customer tracking row: the card pill says it, the
    // tracker below jumps from Agent Assigned to Product Analysis.
    expect(screen.queryByText("Picked Up")).not.toBeInTheDocument();
  });

  it("marks the current status", () => {
    render(<OrderTimeline status="ready_for_delivery" history={history([])} />);

    expect(screen.getByText("current")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("shows timestamps for steps that have been reached", () => {
    render(
      <OrderTimeline
        status="under_analysis"
        history={history([
          [null, "pickup_requested"],
          ["pickup_requested", "agent_assigned"],
          ["agent_assigned", "picked_up"],
        ])}
      />,
    );

    // Two timestamps: Pickup Scheduled and Agent Assigned. The third entry
    // (picked_up) has no dedicated row on the customer tracker.
    expect(screen.getAllByText(/2026/).length).toBeGreaterThanOrEqual(2);
  });

  it("short circuits to a cancelled notice", () => {
    render(
      <OrderTimeline
        status="cancelled"
        history={history([["pickup_requested", "cancelled"]])}
      />,
    );

    expect(screen.getByText("Cancelled")).toBeInTheDocument();
    expect(screen.queryByText("Pickup Scheduled")).not.toBeInTheDocument();
  });
});
