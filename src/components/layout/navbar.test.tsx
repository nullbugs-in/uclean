import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(public)/notifications/actions", () => ({
  markAllNotificationsReadAction: vi.fn(async () => ({ ok: true, marked: 2 })),
}));

import { markAllNotificationsReadAction } from "@/app/(public)/notifications/actions";

import { NotificationsBell } from "@/components/layout/navbar";

/**
 * The notification bell's badge and its read-all control.
 *
 * Three things are worth protecting, and they are the three that are easy to
 * regress without noticing:
 *
 *   1. The badge counts *unread*, so it survives a refresh because it comes from
 *      `notifications.read_at` rather than component state.
 *   2. Clicking Read all persists that, and the button disappears with the badge
 *      rather than lingering as a control that does nothing.
 *   3. Marking read never removes a message. The bell is the only place a
 *      customer can look back at what they were told.
 */

function notifications(
  unread: number,
  items: Array<{ id: number; template: string; read?: boolean }> = [],
) {
  return {
    unread,
    items: items.map((item) => ({
      id: item.id,
      template: item.template,
      channel: "whatsapp",
      read_at: item.read ? "2026-03-02T09:00:00.000Z" : null,
      created_at: "2026-03-01T10:00:00.000Z",
    })),
  };
}

const TWO_MESSAGES = notifications(2, [
  { id: 1, template: "invoice_ready" },
  { id: 2, template: "picked_up" },
]);

beforeEach(() => {
  vi.mocked(markAllNotificationsReadAction).mockClear();
  vi.mocked(markAllNotificationsReadAction).mockResolvedValue({
    ok: true,
    marked: 2,
  });
});

describe("NotificationsBell", () => {
  it("shows the unread count on the trigger and in its accessible name", () => {
    render(<NotificationsBell notifications={TWO_MESSAGES} />);

    expect(
      screen.getByRole("button", { name: "Notifications, 2 recent" }),
    ).toBeInTheDocument();

    // The pill is decoration, so the count reaches assistive tech through the
    // trigger's accessible name rather than being announced twice.
    expect(screen.getByText("2")).toHaveAttribute("aria-hidden", "true");
  });

  it("collapses the count to 9+ above ten", () => {
    render(<NotificationsBell notifications={notifications(24)} />);

    expect(
      screen.getByRole("button", { name: "Notifications, 24 recent" }),
    ).toBeInTheDocument();
    expect(screen.getByText("9+")).toBeInTheDocument();
  });

  it("offers no badge and no read-all button when nothing is unread", async () => {
    const user = userEvent.setup();

    render(
      <NotificationsBell
        notifications={notifications(0, [{ id: 1, template: "delivered" }])}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Notifications" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Notifications" }));

    expect(
      screen.queryByRole("button", { name: "Read all" }),
    ).not.toBeInTheDocument();
  });

  it("persists the clear, drops the badge and keeps the messages", async () => {
    const user = userEvent.setup();

    render(<NotificationsBell notifications={TWO_MESSAGES} />);

    await user.click(screen.getByRole("button", { name: /Notifications/ }));
    await user.click(screen.getByRole("button", { name: "Read all" }));

    // The write happened - this is what survives a refresh.
    await waitFor(() => {
      expect(markAllNotificationsReadAction).toHaveBeenCalledTimes(1);
    });

    // The badge is gone, so the trigger falls back to its bare name.
    expect(
      screen.getByRole("button", { name: "Notifications" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("2")).not.toBeInTheDocument();

    // The messages survive: a message scrolled past has to stay readable.
    expect(screen.getByText("Invoice ready")).toBeInTheDocument();
    expect(screen.getByText("Laundry collected")).toBeInTheDocument();

    // And with nothing left to clear, the button goes with the badge.
    expect(
      screen.queryByRole("button", { name: "Read all" }),
    ).not.toBeInTheDocument();
  });

  it("scrolling the list is reachable from the keyboard", async () => {
    const user = userEvent.setup();

    render(
      <NotificationsBell
        notifications={notifications(
          12,
          Array.from({ length: 12 }, (_, index) => ({
            id: index + 1,
            template: "delivered",
          })),
        )}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Notifications/ }));

    // Focusable and labelled, because the rows hold no controls and a scroll box
    // nobody can reach by keyboard is a scroll box that traps mouse-only users.
    expect(
      screen.getByRole("region", {
        name: "Notifications, 12 in the last week",
      }),
    ).toHaveAttribute("tabindex", "0");
  });
});
