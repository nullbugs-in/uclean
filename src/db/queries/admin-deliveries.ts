import type { DbClient, Invoice, Order, OrderItem, PickupAssignment, Profile } from "@/db/types";

import {
  OPEN_DELIVERY_STATUSES,
  assembleDeliveryRequests,
  type DeliveryRequest,
} from "./admin-deliveries.view";

export * from "./admin-deliveries.view";

/**
 * Data access for the admin delivery module.
 *
 * Reads go through the request-scoped client, like the pickup module: an admin
 * already sees every order and invoice by policy, so there is nothing here that
 * needs the service role, and reaching for it would only make a mistake readable
 * to everyone.
 *
 * The list is built from `orders`, not from `pickup_assignments`. That is the
 * one property worth stating: an order waiting for a delivery agent is the first
 * thing an admin has to act on, so it cannot be the thing the list is missing.
 */

export type DeliveryListOptions = {
  limit?: number;
};

/**
 * Every order that is ready to go out, assigned or not.
 *
 * Five reads and a join in memory, the same shape as `listPickupRequests`, of
 * which it shares the non-trivial half: `assembleDeliveryRequests` delegates to
 * the pickup assembly. Only the queries differ, because only the queries should
 * - the statuses, the assignment leg and the invoice join.
 */
export async function listDeliveryRequests(
  client: DbClient,
  options: DeliveryListOptions = {},
): Promise<DeliveryRequest[]> {
  const limit = options.limit ?? 200;

  const { data: orderRows, error: orderError } = await client
    .from("orders")
    .select("*")
    .in("status", [...OPEN_DELIVERY_STATUSES])
    .order("created_at", { ascending: true })
    .limit(limit);

  if (orderError) throw new Error(orderError.message);

  const orders = orderRows ?? [];
  if (orders.length === 0) return [];

  const orderIds = orders.map((order) => order.id);

  const [itemsResult, assignmentsResult, invoicesResult] = await Promise.all([
    client.from("order_items").select("*").in("order_id", orderIds),
    client
      .from("pickup_assignments")
      .select("*")
      .in("order_id", orderIds)
      .eq("type", "delivery"),
    // `invoices.order_id` is not null unique, so this is at most one row per
    // order. Read in full rather than just the total because the card shows
    // whether it is still to be collected.
    client.from("invoices").select("*").in("order_id", orderIds),
  ]);

  if (itemsResult.error) throw new Error(itemsResult.error.message);
  if (assignmentsResult.error) {
    throw new Error(assignmentsResult.error.message);
  }
  if (invoicesResult.error) throw new Error(invoicesResult.error.message);

  const assignments = (assignmentsResult.data ?? []) as PickupAssignment[];

  const agentIds = [
    ...new Set(
      assignments
        .map((assignment) => assignment.agent_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  // Agent names live on profiles, because agents.id is a profile id rather than
  // a fresh identity. Read through the client: `profiles_select_staff_public`
  // already lets any signed-in user read staff rows.
  const agentsResult =
    agentIds.length > 0
      ? await client.from("profiles").select("id, full_name, mobile").in("id", agentIds)
      : { data: [], error: null };

  if (agentsResult.error) throw new Error(agentsResult.error.message);

  return assembleDeliveryRequests({
    orders: orders as Order[],
    items: (itemsResult.data ?? []) as OrderItem[],
    assignments,
    agents: (agentsResult.data ?? []) as Pick<
      Profile,
      "id" | "full_name" | "mobile"
    >[],
    invoices: (invoicesResult.data ?? []) as Invoice[],
  });
}
