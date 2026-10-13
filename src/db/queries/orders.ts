import type { DbClient, Order, OrderItem, OrderStatusHistory } from "../types";

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

export type OrderWithItems = Order & {
  order_items: OrderItem[];
  order_status_history: OrderStatusHistory[];
};

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

/** A single order with its items and full status history for the timeline. */
export async function getOrderDetail(
  client: Client,
  orderId: string,
): Promise<OrderWithItems | null> {
  const order = await client
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();

  if (order.error) throw new Error(order.error.message);
  if (!order.data) return null;

  const [items, history] = await Promise.all([
    client.from("order_items").select("*").eq("order_id", orderId),
    client
      .from("order_status_history")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true }),
  ]);

  if (items.error) throw new Error(items.error.message);
  if (history.error) throw new Error(history.error.message);

  return {
    ...order.data,
    order_items: items.data ?? [],
    order_status_history: history.data ?? [],
  };
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
