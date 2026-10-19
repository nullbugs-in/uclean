import type {
  DbClient,
  NotificationChannel,
  NotificationTemplate,
} from "../types";

type Client = DbClient;

/** How recent a message has to be for the navbar badge to light up. */
const RECENT_WINDOW_DAYS = 7;

export type NotificationRow = {
  id: number;
  template: NotificationTemplate;
  channel: NotificationChannel;
  status: string;
  order_id: string | null;
  /** Null until the customer marks it read. See migration 13. */
  read_at: string | null;
  created_at: string;
};

/** Customer-facing wording for each template (section 13 of the architecture doc). */
const TEMPLATE_LABEL: Record<NotificationTemplate, string> = {
  otp: "Verification code",
  order_confirmed: "Pickup confirmed",
  agent_assigned: "Rider assigned",
  picked_up: "Laundry collected",
  invoice_ready: "Invoice ready",
  payment_received: "Payment received",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
};

/**
 * The signed-in customer's messages, for the navbar bell.
 *
 * Two counts and one list, in a single round trip:
 *
 *   - `unread` is the badge. It counts only rows with `read_at is null`, so it
 *     survives a refresh and follows the customer to another device.
 *   - `items` is the dropdown. It deliberately still returns read messages,
 *     because the bell is the only place a customer can look back at what they
 *     were told; hiding them would make the list disappear behind the very
 *     button that marked them read. It is capped, because a dropdown is not an
 *     inbox.
 *
 * `unread` and `items.length` are therefore different numbers on purpose, and
 * not because one of them is wrong.
 *
 * Scoped to the last seven days. Older messages are not gone, they are simply
 * outside what the bell offers, which keeps the query on the
 * `(user_id, created_at desc)` index rather than counting a customer's whole
 * history on every render of every page.
 *
 * RLS (`notifications_select_own`) already restricts rows to the caller's own;
 * the explicit filter is kept so the query reads unambiguously on its own.
 */
export async function listRecentNotifications(
  client: Client,
  userId: string,
  limit = 20,
): Promise<{ unread: number; items: NotificationRow[] }> {
  const since = new Date(
    Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [unreadResult, listResult] = await Promise.all([
    client
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("read_at", null)
      .gte("created_at", since),
    client
      .from("notifications")
      .select("id, template, channel, status, order_id, read_at, created_at")
      .eq("user_id", userId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  if (unreadResult.error) throw new Error(unreadResult.error.message);
  if (listResult.error) throw new Error(listResult.error.message);

  return {
    unread: unreadResult.count ?? 0,
    items: (listResult.data ?? []) as NotificationRow[],
  };
}

/** Human label for a template, with a readable fallback for anything unmapped. */
export function notificationLabel(template: string): string {
  const known = TEMPLATE_LABEL[template as NotificationTemplate];
  if (known) return known;
  return template.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}
