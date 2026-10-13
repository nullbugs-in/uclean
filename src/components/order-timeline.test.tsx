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
    render(<OrderTimeline status="picked_up" history={history([])} />);

    const steps = screen
      .getAllByRole("listitem")
      .map((item) => item.textContent);
    expect(steps[0]).toContain("Pickup Scheduled");
    expect(steps[1]).toContain("Agent Assigned");
    expect(steps.at(-1)).toContain("Delivered");
  });

  it("marks the current status", () => {
    render(<OrderTimeline status="ready_for_delivery" history={history([])} />);

    expect(screen.getByText("current")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("shows timestamps for steps that have been reached", () => {
    render(
      <OrderTimeline
        status="picked_up"
        history={history([
          [null, "pickup_requested"],
          ["pickup_requested", "agent_assigned"],
          ["agent_assigned", "picked_up"],
        ])}
      />,
    );

    // Three timestamps, one per completed step.
    expect(screen.getAllByText(/2026/).length).toBeGreaterThanOrEqual(3);
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
