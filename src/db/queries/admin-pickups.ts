import type { DbClient, Profile } from "@/db/types";

import {
  OPEN_PICKUP_STATUSES,
  assemblePickupAgents,
  assemblePickupRequests,
  type PickupAgent,
  type PickupListOptions,
  type PickupRequest,
} from "./admin-pickups.view";

export * from "./admin-pickups.view";

/**
 * Data access for the admin pickup module.
 *
 * Every read goes through the request-scoped client, so RLS is what limits the
 * rows. There is deliberately no service-role path in this file: an admin already
 * sees every order by policy (`is_admin()`), and reaching for elevated access
 * here would only make a mistake writeable to everyone.
 *
 * The pure assembly and filtering live in `./admin-pickups.view` so they can be
 * tested without a database. In particular, the reason this module reads
 * `orders` first rather than `pickup_assignments`: an unassigned request is the
 * first thing an admin has to act on, so it cannot be the thing the list is
 * built from.
 */

/**
 * Every open pickup request in the window, assigned or not.
 *
 * Four queries and a join in memory, the same shape `listAssignedOrders` uses
 * for the staff view. The difference is which table drives it.
 */
export async function listPickupRequests(
  client: DbClient,
  options: PickupListOptions = {},
): Promise<PickupRequest[]> {
  const limit = options.limit ?? 200;

  let query = client
    .from("orders")
    .select("*")
    .in("status", [...OPEN_PICKUP_STATUSES])
    .order("pickup_slot_date", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(limit);

  if (options.from) query = query.gte("pickup_slot_date", options.from);
  if (options.to) query = query.lte("pickup_slot_date", options.to);

  const { data: orderRows, error: orderError } = await query;
  if (orderError) throw new Error(orderError.message);

  const orders = orderRows ?? [];
  if (orders.length === 0) return [];

  const orderIds = orders.map((order) => order.id);
  const slotIds = [
    ...new Set(
      orders
        .map((order) => order.pickup_slot_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const [itemsResult, slotsResult, assignmentsResult] = await Promise.all([
    client.from("order_items").select("*").in("order_id", orderIds),
    slotIds.length > 0
      ? client.from("time_slots").select("*").in("id", slotIds)
      : Promise.resolve({ data: [], error: null }),
    client
      .from("pickup_assignments")
      .select("*")
      .in("order_id", orderIds)
      .eq("type", "pickup"),
  ]);

  if (itemsResult.error) throw new Error(itemsResult.error.message);
  if (slotsResult.error) throw new Error(slotsResult.error.message);
  if (assignmentsResult.error) {
    throw new Error(assignmentsResult.error.message);
  }

  const assignments = assignmentsResult.data ?? [];

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
      ? await client
          .from("profiles")
          .select("id, full_name, mobile")
          .in("id", agentIds)
      : { data: [], error: null };

  if (agentsResult.error) throw new Error(agentsResult.error.message);

  return assemblePickupRequests({
    orders,
    items: itemsResult.data ?? [],
    slots: slotsResult.data ?? [],
    assignments,
    agents: (agentsResult.data ?? []) as Pick<
      Profile,
      "id" | "full_name" | "mobile"
    >[],
  });
}

/**
 * Agents with their profile identity resolved, for the assignment dropdown.
 *
 * Staff only. The roster is the pool of people who collect and return laundry,
 * so it holds the staff role and nothing else. Filtering here rather than
 * trusting the `agents` table on its own means an account that later gains an
 * `agents` row while holding a different role - which older data did allow -
 * still does not turn up as someone the shop can dispatch.
 */
export async function listPickupAgents(
  client: DbClient,
): Promise<PickupAgent[]> {
  const { data: agentRows, error: agentError } = await client
    .from("agents")
    .select("*");

  if (agentError) throw new Error(agentError.message);

  const agents = agentRows ?? [];
  if (agents.length === 0) return [];

  const { data: profileRows, error: profileError } = await client
    .from("profiles")
    .select("id, full_name, mobile, role")
    .in(
      "id",
      agents.map((agent) => agent.id),
    );

  if (profileError) throw new Error(profileError.message);

  const profiles = (profileRows ?? []) as Pick<
    Profile,
    "id" | "full_name" | "mobile" | "role"
  >[];

  // An agent whose profile cannot be read is left out rather than shown blank:
  // the roster is for dispatching real people.
  const staffIds = new Set(
    profiles
      .filter((profile) => profile.role === "staff")
      .map((profile) => profile.id),
  );

  const roster = agents.filter((agent) => staffIds.has(agent.id));
  if (roster.length === 0) return [];

  // Sorted by resolved name rather than by the agents row, which has no name
  // column of its own.
  return assemblePickupAgents(
    roster,
    profiles.filter((profile) => staffIds.has(profile.id)),
  ).sort((a, b) => a.fullName.localeCompare(b.fullName));
}
