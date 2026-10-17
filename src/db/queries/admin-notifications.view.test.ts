import { describe, expect, it } from "vitest";

import type { Notification, Order } from "@/db/types";

import {
  applyLogFilter,
  assembleNotificationLog,
  countLog,
} from "./admin-notifications.view";

function notification(
  overrides: Partial<Notification> = {},
): Notification {
  return {
    id: 1,
    user_id: "u1",
    destination: "+919876543210",
    channel: "whatsapp",
    template: "order_confirmed",
    payload: {},
    status: "sent",
    provider_message_id: null,
    attempts: 1,
    max_attempts: 3,
    last_error: null,
    next_attempt_at: "2026-03-01T00:00:00Z",
    sent_at: "2026-03-01T00:00:01Z",
    invoice_id: null,
    order_id: "o1",
    created_at: "2026-03-01T00:00:00Z",
    updated_at: "2026-03-01T00:00:00Z",
    ...overrides,
  } as Notification;
}

const ORDER = { id: "o1", order_no: "UC-2026-000001" } as Pick<
  Order,
  "id" | "order_no"
>;

describe("assembleNotificationLog", () => {
  it("resolves the order number for a booking message", () => {
    const [entry] = assembleNotificationLog([notification()], [ORDER]);

    expect(entry?.orderNo).toBe("UC-2026-000001");
    expect(entry?.label).toBe("Pickup confirmed");
  });

  /**
   * An OTP is not about a booking. Joining on a missing order would drop it, and
   * the log would quietly stop showing the messages that fail most often.
   */
  it("keeps a message with no order, and no order number", () => {
    const [entry] = assembleNotificationLog(
      [notification({ template: "otp", order_id: null })],
      [ORDER],
    );

    expect(entry?.orderNo).toBeNull();
    expect(entry?.label).toBe("Verification code");
  });

  it("renders no order number for an order the book no longer has", () => {
    const [entry] = assembleNotificationLog([notification()], []);

    expect(entry?.orderNo).toBeNull();
  });
});

describe("applyLogFilter", () => {
  const rows = [
    notification({ id: 1, status: "sent" }),
    notification({ id: 2, status: "queued" }),
    notification({ id: 3, status: "sending" }),
    notification({ id: 4, status: "failed", order_id: null }),
    notification({ id: 5, status: "read" }),
  ];
  const entries = assembleNotificationLog(rows, [ORDER]);

  it("returns everything for all", () => {
    expect(applyLogFilter(entries, "all")).toHaveLength(5);
  });

  it("groups queued and sending as pending", () => {
    expect(applyLogFilter(entries, "pending").map((e) => e.notification.id))
      .toEqual([2, 3]);
  });

  it("counts a read message as delivered", () => {
    expect(applyLogFilter(entries, "sent").map((e) => e.notification.id))
      .toEqual([1, 5]);
  });

  it("separates the failures, which is the point of the page", () => {
    expect(applyLogFilter(entries, "failed").map((e) => e.notification.id))
      .toEqual([4]);
  });
});

describe("countLog", () => {
  it("counts each bucket from the same list", () => {
    const entries = assembleNotificationLog(
      [
        notification({ status: "sent" }),
        notification({ status: "read" }),
        notification({ status: "queued" }),
        notification({ status: "failed" }),
        notification({ status: "failed" }),
      ],
      [ORDER],
    );

    expect(countLog(entries)).toEqual({
      all: 5,
      pending: 1,
      sent: 2,
      failed: 2,
    });
  });
});
