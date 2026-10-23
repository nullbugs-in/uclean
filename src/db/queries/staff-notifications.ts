import type { DbClient, Json, StaffNotificationType } from "../types";

type Client = DbClient;

/** How recent an entry has to be for the staff bell to offer it. */
const RECENT_WINDOW_DAYS = 7;

export type StaffNotificationRow = {
  id: number;
  type: StaffNotificationType;
  order_id: string | null;
  /** Null until the staff member reads it. See migration 22. */
  read_at: string | null;
  created_at: string;
  payload: Json;
};

/**
 * The signed-in staff member's bell entries.
 *
 * An exact mirror of the customer bell's query (`listRecentNotifications`):
 * two counts in one round trip, where `unread` is the badge and `items` is
 * the dropdown - read entries deliberately stay on the list, newest first,
 * because the bell is the only place staff can look back at what happened,
 * and hiding them would make the list disappear behind the button that
 * marked them read.
 *
 * Scoped to the last seven days, which keeps the query on the
 * `(user_id, created_at desc)` partial index rather than counting a staff
 * member's whole history on every render of every panel page.
 *
 * RLS (`staff_notifications_select_own`) already restricts rows to the
 * caller's own; the explicit filter is kept so the query reads
 * unambiguously on its own.
 */
export async function listStaffNotifications(
  client: Client,
  userId: string,
  limit = 50,
): Promise<{ unread: number; items: StaffNotificationRow[] }> {
  const since = new Date(
    Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [unreadResult, listResult] = await Promise.all([
    client
      .from("staff_notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("read_at", null)
      .gte("created_at", since),
    client
      .from("staff_notifications")
      .select("id, type, order_id, read_at, created_at, payload")
      .eq("user_id", userId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  if (unreadResult.error) throw new Error(unreadResult.error.message);
  if (listResult.error) throw new Error(listResult.error.message);

  return {
    unread: unreadResult.count ?? 0,
    items: (listResult.data ?? []) as StaffNotificationRow[],
  };
}

/** Human title for each entry type, with a readable fallback. */
export function staffNotificationTitle(type: string): string {
  const known: Partial<Record<StaffNotificationType, string>> = {
    pickup_assigned: "Pickup assigned",
    delivery_assigned: "Delivery assigned",
    pickup_reminder: "Pickup today",
    delivery_reminder: "Delivery today",
  };
  const title = known[type as StaffNotificationType];
  if (title) return title;
  return type.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}
