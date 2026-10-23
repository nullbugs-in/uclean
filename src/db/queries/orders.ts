import type { DbClient, Order, OrderStatusHistory } from "../types";

type Client = DbClient;

function unwrap<T>(result: {
  data: T | null;
  error: { message: string } | null;
}): T {
  if (result.error) {
    throw new Error(result.error.message);
  }
  return result.data as T;
}

/** A customer's own orders, newest first. RLS already scopes this to them. */
export async function listOrdersForCustomer(
  client: Client,
  customerId: string,
): Promise<Order[]> {
  return unwrap(
    await client
      .from("orders")
      .select("*")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false }),
  );
}

/** Active orders on the customer dashboard: everything not finished or dead. */
export async function listActiveOrdersForCustomer(
  client: Client,
  customerId: string,
): Promise<Order[]> {
  return unwrap(
    await client
      .from("orders")
      .select("*")
      .eq("customer_id", customerId)
      .not("status", "in", "(delivered,cancelled)")
      .order("created_at", { ascending: false }),
  );
}

/**
 * How many orders a customer has placed, active or not.
 *
 * `head: true` fetches no rows, so this stays a count. The public layout uses
 * it to decide whether to show the "My bookings" shortcut in the navbar, which
 * only appears once someone has actually booked.
 */
export async function countCustomerOrders(
  client: Client,
  customerId: string,
): Promise<number> {
  const { count, error } = await client
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", customerId);

  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * Status history for every order a customer owns, keyed by order id.
 *
 * A plain record rather than a Map so it can be handed to a client component.
 * Fetched in one `in (...)` query rather than per order, so the bookings page
 * costs the same whatever the customer's history length.
 */
export async function listOrderHistoryForCustomer(
  client: Client,
  customerId: string,
): Promise<Record<string, OrderStatusHistory[]>> {
  const { data: orders, error: ordersError } = await client
    .from("orders")
    .select("id")
    .eq("customer_id", customerId);

  if (ordersError) throw new Error(ordersError.message);

  const orderIds = (orders ?? []).map((order) => order.id);
  if (orderIds.length === 0) return {};

  const { data, error } = await client
    .from("order_status_history")
    .select("order_id, from_status, to_status, note, created_at")
    .in("order_id", orderIds)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  const grouped: Record<string, OrderStatusHistory[]> = {};
  for (const row of data ?? []) {
    (grouped[row.order_id] ??= []).push(row as OrderStatusHistory);
  }

  return grouped;
}

/**
 * Orders for the staff pickup and delivery lists.
 *
 * RLS decides what this actually returns: store staff see everything, ordinary
 * staff see only orders they hold an assignment against. That filtering lives
 * in the database on purpose, so a mistake here cannot leak the order book.
 */
export async function listOrdersForStaff(
  client: Client,
  options: { from?: string; to?: string; limit?: number } = {},
): Promise<Order[]> {
  let query = client
    .from("orders")
    .select("*")
    .gte(
      "pickup_slot_date",
      options.from ?? new Date().toISOString().slice(0, 10),
    )
    .order("pickup_slot_date", { ascending: true })
    .limit(options.limit ?? 100);

  if (options.to) {
    query = query.lte("pickup_slot_date", options.to);
  }

  return unwrap(await query);
}

/** Dashboard aggregates for the admin home screen (section 8.1). */
export async function getAdminOrderCounts(
  client: Client,
  today: string,
): Promise<{
  ordersToday: number;
  pendingPickups: number;
  deliveredToday: number;
}> {
  const [todayCount, pending, delivered] = await Promise.all([
    client
      .from("orders")
      .select("id", { count: "exact", head: true })
      .gte("created_at", `${today}T00:00:00.000Z`),
    client
      .from("orders")
      .select("id", { count: "exact", head: true })
      .in("status", ["pickup_requested", "agent_assigned"]),
    client
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "delivered")
      .gte("updated_at", `${today}T00:00:00.000Z`),
  ]);

  if (todayCount.error) throw new Error(todayCount.error.message);
  if (pending.error) throw new Error(pending.error.message);
  if (delivered.error) throw new Error(delivered.error.message);

  return {
    ordersToday: todayCount.count ?? 0,
    pendingPickups: pending.count ?? 0,
    deliveredToday: delivered.count ?? 0,
  };
}
