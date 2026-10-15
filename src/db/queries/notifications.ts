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
 * The signed-in customer's recent messages, for the navbar bell.
 *
 * One query serves both the badge and the panel: `count: "exact"` returns the
 * total alongside the rows, so opening the dropdown costs no second round trip.
 *
 * Scoped to the last seven days on purpose. The `read` status exists in the
 * enum, but nothing in the app writes it yet, so a true unread count would
 * always read zero and the bell would look permanently empty.
 *
 * RLS (`notifications_select_own`) already restricts rows to the caller's own;
 * the explicit filter is kept so the query reads unambiguously on its own.
 */
export async function listRecentNotifications(
  client: Client,
  userId: string,
  limit = 5,
): Promise<{ count: number; items: NotificationRow[] }> {
  const since = new Date(
    Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data, count, error } = await client
    .from("notifications")
    .select("id, template, channel, status, order_id, created_at", {
      count: "exact",
    })
    .eq("user_id", userId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  return { count: count ?? 0, items: (data ?? []) as NotificationRow[] };
}

/** Human label for a template, with a readable fallback for anything unmapped. */
export function notificationLabel(template: string): string {
  const known = TEMPLATE_LABEL[template as NotificationTemplate];
  if (known) return known;
  return template.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}
