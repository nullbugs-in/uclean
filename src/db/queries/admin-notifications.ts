import type { DbClient, Notification, Order } from "@/db/types";

import {
  assembleNotificationLog,
  type NotificationLogEntry,
} from "./admin-notifications.view";

export * from "./admin-notifications.view";

/**
 * Data access for the admin message log.
 *
 * Reads go through the request-scoped client: `notifications_select_own` already
 * carries `or is_admin()`, so an admin sees the whole log through policy and
 * there is nothing here that needs the service role. The worker that actually
 * drains the queue is a separate module, because it runs outside the request path
 * entirely.
 */

export type NotificationLogOptions = {
  limit?: number;
};

/**
 * The newest messages first.
 *
 * Two reads: the queue, then the bookings those messages are about. The order
 * numbers are worth the second one - a log of template names alone cannot be
 * matched against the order book an admin is looking at - but an OTP or anything
 * else with no booking simply has no order number rather than being dropped.
 */
export async function listNotificationLog(
  client: DbClient,
  options: NotificationLogOptions = {},
): Promise<NotificationLogEntry[]> {
  const limit = options.limit ?? 200;

  const { data, error } = await client
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Notification[];
  if (rows.length === 0) return [];

  const orderIds = [
    ...new Set(
      rows
        .map((notification) => notification.order_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const ordersResult =
    orderIds.length > 0
      ? await client.from("orders").select("id, order_no").in("id", orderIds)
      : { data: [], error: null };

  if (ordersResult.error) throw new Error(ordersResult.error.message);

  return assembleNotificationLog(rows, (ordersResult.data ?? []) as Pick<
    Order,
    "id" | "order_no"
  >[]);
}
