import type { Notification, Order } from "@/db/types";

import { notificationLabel } from "./notifications";

/**
 * Pure read model for the admin message log (section 8.7).
 *
 * "Message log, delivery status, failures and retries" is a question about the
 * whole queue, so it is built from `notifications` and never from a user's own
 * rows. `notifications_select_own` already carries `or is_admin()`, which is what
 * makes that read legal rather than a reason to reach for the service role.
 *
 * The interesting state is the one the customer cannot see: a message that has
 * been retried and failed again is invisible from the app but is exactly what an
 * admin opens this page for, so the counts below are split to put it first.
 */

export const LOG_FILTERS = ["all", "pending", "sent", "failed"] as const;

export type LogFilter = (typeof LOG_FILTERS)[number];

export const LOG_FILTER_LABEL: Record<LogFilter, string> = {
  all: "All",
  pending: "Queued",
  sent: "Sent",
  failed: "Failed",
};

export type NotificationLogEntry = {
  notification: Notification;
  /** Human wording for the template, from the shared label table. */
  label: string;
  /** The booking this message is about, if it had one. */
  orderNo: string | null;
};

export type LogCounts = {
  all: number;
  pending: number;
  sent: number;
  failed: number;
};

/** A message is only in the queue, or already gone. */
function isPending(notification: Notification): boolean {
  return notification.status === "queued" || notification.status === "sending";
}

/** `read` is a delivery receipt rather than another outcome. */
function isSent(notification: Notification): boolean {
  return notification.status === "sent" || notification.status === "read";
}

/**
 * Resolves each row against its order.
 *
 * The order is joined rather than carried so a message that is not about a
 * booking (an OTP, say) still renders as a row with no order number rather than
 * being filtered out.
 */
export function assembleNotificationLog(
  rows: Notification[],
  orders: Pick<Order, "id" | "order_no">[],
): NotificationLogEntry[] {
  const orderById = new Map(orders.map((order) => [order.id, order.order_no]));

  return rows.map((notification) => ({
    notification,
    label: notificationLabel(notification.template),
    orderNo: notification.order_id
      ? (orderById.get(notification.order_id) ?? null)
      : null,
  }));
}

export function applyLogFilter(
  entries: NotificationLogEntry[],
  filter: LogFilter,
): NotificationLogEntry[] {
  switch (filter) {
    case "pending":
      return entries.filter((entry) => isPending(entry.notification));
    case "sent":
      return entries.filter((entry) => isSent(entry.notification));
    case "failed":
      return entries.filter((entry) => entry.notification.status === "failed");
    case "all":
    default:
      return entries;
  }
}

export function countLog(entries: NotificationLogEntry[]): LogCounts {
  const notifications = entries.map((entry) => entry.notification);

  return {
    all: notifications.length,
    pending: notifications.filter(isPending).length,
    sent: notifications.filter(isSent).length,
    failed: notifications.filter((n) => n.status === "failed").length,
  };
}
