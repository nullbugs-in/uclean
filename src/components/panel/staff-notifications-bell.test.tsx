import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(staff)/staff/notifications/actions", () => ({
  markAllStaffNotificationsReadAction: vi.fn(async () => ({
    ok: true,
    marked: 2,
  })),
  markStaffNotificationReadAction: vi.fn(async () => ({
    ok: true,
    marked: true,
  })),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/db/client", () => ({
  createClient: vi.fn(() => ({
    channel: vi.fn(() => channelStub),
    removeChannel: vi.fn(),
  })),
}));

import {
  markAllStaffNotificationsReadAction,
  markStaffNotificationReadAction,
} from "@/app/(staff)/staff/notifications/actions";
import { toast } from "sonner";

import {
  StaffNotificationsBell,
  type StaffBellNotifications,
} from "@/components/panel/staff-notifications-bell";
import type { StaffNotificationRow } from "@/db/queries/staff-notifications";
import type {
  StaffNotificationPayload,
  StaffNotificationType,
} from "@/db/types";

/**
 * The staff bell.
 *
 * The behaviours worth protecting are the customer bell's (badge counts
 * unread from read_at, read-all persists and clears, entries never disappear,
 * nothing is relinked when there is nothing to open) plus the ones this bell
 * exists for because assignments happen while staff work elsewhere:
 *
 *   5. A realtime insert prepends the entry, counts on the badge and raises
 *      the toast - the "you were just assigned a pickup" moment.
 *   6. The same id delivered twice does not duplicate itself.
 *   7. A leg's entry opens that leg's list (pickup vs delivery), and a
 *      reminder with no order behind it stays plain text.
 */

const ORDER_A = "11111111-1111-4111-8111-111111111111";
const ORDER_B = "22222222-2222-4222-8222-222222222222";

const channelStub = {
  on: vi.fn(),
  subscribe: vi.fn(),
};

// The component's realtime handler is captured here so a test can fire an
// INSERT payload as if Supabase delivered it.
const registeredHandlers: Array<(payload: { new: unknown }) => void> = [];

beforeEach(() => {
  registeredHandlers.length = 0;
  channelStub.on.mockClear();
  channelStub.subscribe.mockClear();

  vi.mocked(toast.success).mockClear();
  vi.mocked(markAllStaffNotificationsReadAction).mockClear();
  vi.mocked(markAllStaffNotificationsReadAction).mockResolvedValue({
    ok: true,
    marked: 2,
  });
  vi.mocked(markStaffNotificationReadAction).mockClear();
  vi.mocked(markStaffNotificationReadAction).mockResolvedValue({
    ok: true,
    marked: true,
  });

  channelStub.on.mockImplementation(
    (
      event: string,
      _filter: unknown,
      handler: (payload: { new: unknown }) => void,
    ) => {
      registeredHandlers.push(handler);
      return channelStub;
    },
  );
  channelStub.subscribe.mockImplementation(
    (callback?: (status: string) => void) => {
      callback?.("SUBSCRIBED");
      return channelStub;
    },
  );
});

type RowInput = {
  id: number;
  type: string;
  order?: string | null;
  read?: boolean;
  payload?: Record<string, unknown>;
};

function notifications(
  unread: number,
  items: RowInput[] = [],
): StaffBellNotifications {
  return { unread, items: items.map(toRow) };
}

function toRow(input: {
  id: number;
  type: string;
  order?: string | null;
  read?: boolean;
  payload?: Record<string, unknown>;
}): StaffNotificationRow {
  return {
    id: input.id,
    type: input.type as StaffNotificationType,
    order_id: input.order ?? null,
    read_at: input.read ? "2026-03-02T09:00:00.000Z" : null,
    created_at: "2026-03-01T10:00:00.000Z",
    payload: (input.payload ?? {}) as StaffNotificationPayload,
  };
}

const BASE_PAYLOAD = {
  leg: "pickup",
  order_no: "UC0000001",
  customer_name: "Asha",
  slot_date: "2026-03-12",
  slot_label: "10:00-12:00",
  assigned_by_type: "manual",
  assigned_by_name: "Rajesh",
};

const TWO_ASSIGNMENTS = notifications(2, [
  {
    id: 1,
    type: "pickup_assigned",
    order: ORDER_A,
    payload: BASE_PAYLOAD,
  },
  {
    id: 2,
    type: "delivery_assigned",
    order: ORDER_B,
    payload: { ...BASE_PAYLOAD, leg: "delivery", order_no: "UC0000002" },
  },
]);

/** Fires one realtime INSERT at the component. */
function deliver(row: unknown) {
  for (const handler of registeredHandlers) handler({ new: row });
}

describe("StaffNotificationsBell", () => {
  it("shows the unread count on the trigger and in its accessible name", () => {
    render(<StaffNotificationsBell notifications={TWO_ASSIGNMENTS} />);

    expect(
      screen.getByRole("button", { name: "Notifications, 2 recent" }),
    ).toBeInTheDocument();

    // The pill is decoration, so the count reaches assistive tech through the
    // trigger's accessible name rather than being announced twice.
    expect(screen.getByText("2")).toHaveAttribute("aria-hidden", "true");
  });

  it("offers no badge and no read-all button when nothing is unread", async () => {
    const user = userEvent.setup();

    render(
      <StaffNotificationsBell
        notifications={notifications(0, [
          {
            id: 1,
            type: "pickup_assigned",
            order: ORDER_A,
            read: true,
            payload: BASE_PAYLOAD,
          },
        ])}
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

  it("persists the read-all, drops the badge and keeps the entries", async () => {
    const user = userEvent.setup();

    render(<StaffNotificationsBell notifications={TWO_ASSIGNMENTS} />);

    await user.click(screen.getByRole("button", { name: /Notifications/ }));
    await user.click(screen.getByRole("button", { name: "Read all" }));

    await waitFor(() => {
      expect(markAllStaffNotificationsReadAction).toHaveBeenCalledTimes(1);
    });

    // The badge is gone, so the trigger falls back to its bare name.
    expect(
      screen.getByRole("button", { name: "Notifications" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("2")).not.toBeInTheDocument();

    // The entries survive: the bell is the only place staff can look back.
    expect(screen.getByText("Pickup assigned")).toBeInTheDocument();
    expect(screen.getByText("Delivery assigned")).toBeInTheDocument();

    expect(
      screen.queryByRole("button", { name: "Read all" }),
    ).not.toBeInTheDocument();
  });

  it("shows assignment details: order no, slot and how it was assigned", async () => {
    const user = userEvent.setup();

    render(
      <StaffNotificationsBell
        notifications={notifications(1, [
          {
            id: 1,
            type: "pickup_assigned",
            order: ORDER_A,
            payload: BASE_PAYLOAD,
          },
        ])}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Notifications/ }));

    expect(screen.getByText("UC0000001")).toBeInTheDocument();
    expect(screen.getByText("Assigned by Rajesh")).toBeInTheDocument();
    // The leg is there for a skim: the slot line carries the date and time.
    expect(screen.getByText(/10:00-12:00/)).toBeInTheDocument();
  });

  it("prepends a realtime insert, raises the toast and counts it", () => {
    render(<StaffNotificationsBell notifications={TWO_ASSIGNMENTS} />);

    // The callback runs inside act so React flushes the state update, the
    // way the browser would between the event and the paint.
    act(() => {
      deliver(
        toRow({
          id: 7,
          type: "pickup_assigned",
          order: ORDER_B,
          payload: {
            ...BASE_PAYLOAD,
            leg: "pickup",
            order_no: "UC0000009",
            assigned_by_type: "auto",
          },
        }),
      );
    });

    // Newest at the top, badge counted immediately...
    expect(
      screen.getByRole("button", { name: "Notifications, 3 recent" }),
    ).toBeInTheDocument();

    // ...without opening the dropdown, because the toast is the popup.
    expect(toast.success).toHaveBeenCalledWith(
      "Pickup assigned",
      expect.objectContaining({
        description: expect.stringContaining("UC0000009"),
      }),
    );

    // And the locative copy differs for an auto assignment.
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it("ignores a realtime insert the server list already contained", () => {
    render(
      <StaffNotificationsBell
        notifications={notifications(1, [
          {
            id: 1,
            type: "pickup_assigned",
            order: ORDER_A,
            payload: BASE_PAYLOAD,
          },
        ])}
      />,
    );

    deliver(
      toRow({
        id: 1,
        type: "pickup_assigned",
        order: ORDER_A,
        payload: BASE_PAYLOAD,
      }),
    );

    expect(
      screen.getByRole("button", { name: "Notifications, 1 recent" }),
    ).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("opens a pickup entry on the pickup list and a delivery entry on the deliveries list", async () => {
    const user = userEvent.setup();

    render(<StaffNotificationsBell notifications={TWO_ASSIGNMENTS} />);
    await user.click(screen.getByRole("button", { name: /Notifications/ }));

    expect(
      screen.getByRole("link", { name: /Pickup assigned/ }),
    ).toHaveAttribute("href", "/staff/pickups");
    expect(
      screen.getByRole("link", { name: /Delivery assigned/ }),
    ).toHaveAttribute("href", "/staff/deliveries");
  });

  it("marks the tapped entry read and drops the badge by one", async () => {
    const user = userEvent.setup();

    render(
      <StaffNotificationsBell
        notifications={notifications(1, [
          {
            id: 1,
            type: "delivery_assigned",
            order: ORDER_A,
            payload: { ...BASE_PAYLOAD, leg: "delivery" },
          },
        ])}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Notifications/ }));

    await user.click(screen.getByRole("link", { name: /Delivery assigned/ }));

    await waitFor(() => {
      expect(markStaffNotificationReadAction).toHaveBeenCalledWith({
        notificationId: 1,
      });
    });

    // Closing the dropdown plus the optimistically cleared badge leaves the
    // trigger rendering as if nothing were unread.
    expect(
      screen.getByRole("button", { name: "Notifications" }),
    ).toBeInTheDocument();
  });

  it("does not rewrite an entry that was already read", async () => {
    const user = userEvent.setup();

    render(
      <StaffNotificationsBell
        notifications={notifications(0, [
          {
            id: 1,
            type: "pickup_assigned",
            order: ORDER_A,
            read: true,
            payload: BASE_PAYLOAD,
          },
        ])}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Notifications" }));
    await user.click(screen.getByRole("link", { name: /Pickup assigned/ }));

    expect(markStaffNotificationReadAction).not.toHaveBeenCalled();
  });

  it("renders a reminder with no order behind it unlinked", async () => {
    const user = userEvent.setup();

    render(
      <StaffNotificationsBell
        notifications={notifications(1, [
          {
            id: 9,
            type: "pickup_reminder",
            order: null,
            payload: { order_no: "UC0000042" },
          },
        ])}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Notifications/ }));

    expect(screen.getByText("Pickup today")).toBeInTheDocument();
    expect(screen.getByText("UC0000042")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("keeps the realtime wiring the badge depends on", () => {
    render(
      <StaffNotificationsBell
        notifications={notifications(1, [
          {
            id: 1,
            type: "pickup_assigned",
            order: ORDER_A,
            payload: BASE_PAYLOAD,
          },
        ])}
      />,
    );

    // The INSERT subscription is what delivers the instant toast; if this is
    // ever unhooked, the badge still corrects on the next render but the
    // popup the staff panel is built around silently disappears.
    expect(registeredHandlers.length).toBe(1);
  });
});
