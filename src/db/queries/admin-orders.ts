import type {
  DbClient,
  Order,
  OrderItem,
  OrderStatus,
  OrderStatusHistory,
  PickupAssignment,
  Profile,
  TimeSlot,
} from "@/db/types";

import {
  BOOKINGS_PAGE_SIZE,
  SUMMARY_GROUPS,
  applyJoinedFilters,
  escapeForIlike,
  expandStatusFilter,
  paginate,
  searchTerms,
  sortOrders,
  type AdminOrderRow,
  type BookingAgent,
  type BookingFilterResult,
  type BookingSummary,
  type OrderFilter,
} from "./admin-orders.view";

export * from "./admin-orders.view";

/**
 * Data access for the admin bookings module.
 *
 * Kept apart from `db/queries/orders.ts`, which staff and the customer pages both
 * read, so nothing here can change what they see. An admin sees every order in
 * every state; a staff member sees only what RLS gives them, and a customer only
 * their own. That difference lives in the policies, not here.
 *
 * Reads go through the request-scoped client throughout. `is_admin()` already
 * satisfies the select policies on `orders`, `order_items`, `order_status_history`,
 * `pickup_assignments` and `invoices`, so there is nothing here that needs the
 * service role, which is the property that keeps this from becoming a way to read
 * other people's orders by accident.
 */

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

/**
 * Ids of the orders matching the filters that live in SQL.
 *
 * Only this is paginated in the database. Assignment state cannot be filtered
 * there without a join that PostgREST would have to express as a nested filter
 * across a one-to-many table, so it is applied afterwards to the full matching
 * set. That is the honest trade: that one filter costs a scan of the filtered
 * set, and everything else stays indexed.
 *
 * Capped so an unbounded filter cannot pull the whole order book into memory. A
 * store booking a few thousand loads will never reach it; one that does gets the
 * newest orders and a `truncated` flag rather than an out-of-memory error.
 */
const MATCH_LIMIT = 5000;

/**
 * Every booking matching a filter, plus the page the UI should show.
 *
 * Status, search, the pickup date range and the sort all happen in SQL against
 * indexed columns. The trigram indexes added in migration 12 are what make the
 * ILIKE search an index scan rather than a scan of the table.
 */
export async function listAdminOrders(
  client: DbClient,
  filter: OrderFilter = {},
  options: { pageSize?: number } = {},
): Promise<BookingFilterResult> {
  const pageSize = options.pageSize ?? BOOKINGS_PAGE_SIZE;

  let query = client
    .from("orders")
    .select("id")
    .order("created_at", { ascending: filter.sort === "oldest" })
    .limit(MATCH_LIMIT);

  const statuses = filter.status ? expandStatusFilter(filter.status) : null;
  if (statuses) query = query.in("status", statuses);

  if (filter.pickupFrom)
    query = query.gte("pickup_slot_date", filter.pickupFrom);
  if (filter.pickupTo) query = query.lte("pickup_slot_date", filter.pickupTo);

  if (filter.sort === "pickup") {
    query = query
      .order("pickup_slot_date", { ascending: true })
      .order("created_at", { ascending: true });
  }

  const terms = searchTerms(filter.search).filter((term) => term.length > 1);

  if (terms.length > 0) {
    /*
     * One `or` clause per term, each with its own wildcards, so every term has
     * to match somewhere across the three fields. Multiple `or()` calls are ANDed
     * by PostgREST, which is exactly the narrowing wanted.
     */
    query = query.or(
      terms
        .map(
          (term) =>
            `order_no.ilike.%${escapeForIlike(term)}%,` +
            `customer_name.ilike.%${escapeForIlike(term)}%,` +
            `customer_mobile.ilike.%${escapeForIlike(term)}%`,
        )
        .join(","),
    );
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const ids = ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
  const truncated = ids.length >= MATCH_LIMIT;

  if (ids.length === 0) {
    return {
      rows: [],
      total: 0,
      page: 1,
      pageCount: 1,
      hasPrevious: false,
      hasNext: false,
      truncated,
    };
  }

  const rows = await enrichOrders(client, ids);
  const filtered = applyJoinedFilters(rows, filter);
  const sorted = sortOrders(filtered, filter.sort ?? "newest");

  return { ...paginate(sorted, filter.page ?? 1, pageSize), truncated };
}

/**
 * Loads the orders plus everything the list shows about them.
 *
 * Four queries in parallel, joined in memory. The relationships fan out in two
 * directions (items and two assignment types) so a single wide select would
 * either duplicate the order row per item or nest JSON that every column has to
 * dig back out of. One `in (...)` per table keeps it to a fixed number of round
 * trips whatever the page size, which is the property that makes this not an N+1.
 *
 * Invoices and payments are not read. The list is a work queue and shows no
 * money, so fetching them would be two round trips per page spent on data that
 * nothing displays.
 */
async function enrichOrders(
  client: DbClient,
  ids: string[],
): Promise<AdminOrderRow[]> {
  const [orders, items, assignments] = await Promise.all([
    client.from("orders").select("*").in("id", ids),
    client.from("order_items").select("*").in("order_id", ids),
    client.from("pickup_assignments").select("*").in("order_id", ids),
  ]);

  for (const result of [orders, items, assignments]) {
    if (result.error) throw new Error(result.error.message);
  }

  const orderRows = (orders.data ?? []) as Order[];
  const itemRows = (items.data ?? []) as OrderItem[];
  const assignmentRows = (assignments.data ?? []) as PickupAssignment[];

  /*
   * Two reads that need ids the first batch produced, so they cannot join it.
   * Each is issued with an empty list guarded away rather than with `.in([])`,
   * which PostgREST would reject.
   */
  const slotIds = uniqueIds(orderRows.map((order) => order.pickup_slot_id));
  const agentIds = uniqueIds(
    assignmentRows
      .map((assignment) => assignment.agent_id)
      .filter((id): id is string => Boolean(id)),
  );

  const [slots, profiles] = await Promise.all([
    slotIds.length > 0
      ? client
          .from("time_slots")
          .select("id, label, start_time, end_time")
          .in("id", slotIds)
      : Promise.resolve({ data: [], error: null }),
    agentIds.length > 0
      ? client.from("profiles").select("id, full_name").in("id", agentIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (slots.error) throw new Error(slots.error.message);
  if (profiles.error) throw new Error(profiles.error.message);

  const nameById = new Map(
    ((profiles.data ?? []) as Array<Pick<Profile, "id" | "full_name">>).map(
      (profile) => [profile.id, profile.full_name],
    ),
  );

  const itemsByOrder = groupBy(itemRows, (item) => item.order_id);
  const assignmentsByOrder = groupBy(assignmentRows, (row) => row.order_id);
  const slotById = new Map(
    (slots.data ?? []).map((slot) => [
      slot.id,
      slot as Pick<TimeSlot, "id" | "label" | "start_time" | "end_time">,
    ]),
  );

  return orderRows.map((order) => {
    const orderItems = itemsByOrder.get(order.id) ?? [];
    const orderAssignments = assignmentsByOrder.get(order.id) ?? [];

    const pickup = orderAssignments.find((row) => row.type === "pickup");
    const delivery = orderAssignments.find((row) => row.type === "delivery");

    // A cancelled assignment is history, not an owner. Counting it would show an
    // agent as still holding a pickup they have been released from.
    const livePickup = pickup && pickup.status !== "cancelled" ? pickup : null;
    const liveDelivery =
      delivery && delivery.status !== "cancelled" ? delivery : null;

    const slot = slotById.get(order.pickup_slot_id);

    return {
      ...order,
      pickupAgentId: livePickup?.agent_id ?? null,
      pickupAgentName: livePickup?.agent_id
        ? (nameById.get(livePickup.agent_id) ?? null)
        : null,
      deliveryAgentId: liveDelivery?.agent_id ?? null,
      deliveryAgentName: liveDelivery?.agent_id
        ? (nameById.get(liveDelivery.agent_id) ?? null)
        : null,
      slotLabel: slot
        ? (slot.label ?? `${slot.start_time}-${slot.end_time}`)
        : null,
      items: orderItems,
      itemCount: orderItems.length,
    } satisfies AdminOrderRow;
  });
}

// ---------------------------------------------------------------------------
// Summary figures
// ---------------------------------------------------------------------------

/**
 * The headline counts, each a real `count(*)`.
 *
 * Five parallel `head: true` selects. Taken from the database rather than from
 * whatever list happens to be on screen, so the figures describe the business
 * rather than the current filter. A `head` select fetches no rows, so this costs
 * five index scans and no data.
 */
export async function getBookingSummary(
  client: DbClient,
): Promise<BookingSummary> {
  const groups = await Promise.all(
    SUMMARY_GROUPS.map(async (group) => {
      const { count, error } = await client
        .from("orders")
        .select("id", { count: "exact", head: true })
        .in("status", [...group.statuses]);

      if (error) throw new Error(error.message);

      return [group.key, count ?? 0] as const;
    }),
  );

  const { count: total, error: totalError } = await client
    .from("orders")
    .select("id", { count: "exact", head: true });

  if (totalError) throw new Error(totalError.message);

  const tallies = Object.fromEntries(groups) as Record<
    keyof BookingSummary,
    number
  >;

  return {
    total: total ?? 0,
    awaitingPickup: tallies.awaitingPickup,
    inProgress: tallies.inProgress,
    readyForDelivery: tallies.readyForDelivery,
    delivered: tallies.delivered,
    open:
      tallies.awaitingPickup + tallies.inProgress + tallies.readyForDelivery,
  };
}

// ---------------------------------------------------------------------------
// One booking in full
// ---------------------------------------------------------------------------

export type AdminOrderDetail = Order & {
  order_items: OrderItem[];
  order_status_history: OrderStatusHistory[];
  /** Resolved so the status log can name who acted. */
  actorNames: Record<string, string>;
  /**
   * Whether an invoice already exists for this booking.
   *
   * Not billing UI, and not a price. It is the lock on the item lines:
   * `createInvoice` deletes and replaces every `order_items` row, so once an
   * invoice exists the lines are the record of what was billed and editing them
   * would be silently discarded.
   */
  hasInvoice: boolean;
  pickupAgent: BookingAgent | null;
  deliveryAgent: BookingAgent | null;
  slotLabel: string | null;
};

/**
 * One booking with its lines, its full status history, and the two things a
 * history read on its own does not give: who acted, and whether an invoice
 * already exists for this booking.
 *
 * `getOrderDetail` in the shared module resolves items and history, but resolves
 * neither actor names nor invoice state, and changing it would change the staff
 * page too. So this reads them alongside rather than through it.
 *
 * Everything the detail page renders comes from here in one round trip, so the
 * page does not fan out into per-section queries.
 */
export async function getAdminOrderDetail(
  client: DbClient,
  orderId: string,
): Promise<AdminOrderDetail | null> {
  const orderResult = await client
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();

  if (orderResult.error) throw new Error(orderResult.error.message);
  if (!orderResult.data) return null;

  const [
    itemsResult,
    historyResult,
    assignmentsResult,
    invoiceResult,
    slotResult,
  ] = await Promise.all([
    client.from("order_items").select("*").eq("order_id", orderId),
    client
      .from("order_status_history")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true }),
    client.from("pickup_assignments").select("*").eq("order_id", orderId),
    // Read only for its existence, and only to decide whether the item lines are
    // still editable. `invoices.order_id` is not null unique, so at most one row
    // comes back and its presence is the answer.
    client.from("invoices").select("id").eq("order_id", orderId).maybeSingle(),
    client
      .from("time_slots")
      .select("id, label, start_time, end_time")
      .eq("id", orderResult.data.pickup_slot_id)
      .maybeSingle(),
  ]);

  if (itemsResult.error) throw new Error(itemsResult.error.message);
  if (historyResult.error) throw new Error(historyResult.error.message);
  if (assignmentsResult.error) throw new Error(assignmentsResult.error.message);
  if (invoiceResult.error) throw new Error(invoiceResult.error.message);
  if (slotResult.error) throw new Error(slotResult.error.message);

  const history = (historyResult.data ?? []) as OrderStatusHistory[];
  const assignments = (assignmentsResult.data ?? []) as PickupAssignment[];

  const agentIds = uniqueIds(
    assignments
      .map((assignment) => assignment.agent_id)
      .filter((id): id is string => Boolean(id)),
  );

  /*
   * Actors and agents are both profile ids and are very often the same people,
   * so they are read once, together. Two reads would have been one wasted round
   * trip per booking page view.
   */
  const profileIds = uniqueIds([
    ...agentIds,
    ...history
      .map((entry) => entry.changed_by)
      .filter((id): id is string => Boolean(id)),
  ]);

  const profiles =
    profileIds.length > 0
      ? ((
          await client
            .from("profiles")
            .select("id, full_name, mobile")
            .in("id", profileIds)
        ).data ?? [])
      : [];

  const profileById = new Map(
    (profiles as Array<Pick<Profile, "id" | "full_name" | "mobile">>).map(
      (profile) => [profile.id, profile],
    ),
  );

  const slot = slotResult.data;
  const pickup = assignments.find(
    (row) => row.type === "pickup" && row.status !== "cancelled",
  );
  const delivery = assignments.find(
    (row) => row.type === "delivery" && row.status !== "cancelled",
  );

  return {
    ...orderResult.data,
    order_items: (itemsResult.data ?? []) as OrderItem[],
    order_status_history: history,
    actorNames: Object.fromEntries(
      [...profileById].map(([id, profile]) => [id, profile.full_name]),
    ),
    hasInvoice: Boolean(invoiceResult.data),
    pickupAgent: toAgent(pickup, profileById),
    deliveryAgent: toAgent(delivery, profileById),
    slotLabel: slot
      ? (slot.label ?? `${slot.start_time}-${slot.end_time}`)
      : null,
  };
}

/**
 * Resolves an assignment row to the person holding it.
 *
 * A null `agent_id` is a removed agent, not a missing one: migration 11 detaches
 * it so the account can be deleted. Naming them "Agent removed" is the honest
 * reading — inventing a name or silently showing nobody would both misreport who
 * did the work.
 */
function toAgent(
  assignment: PickupAssignment | undefined,
  profileById: Map<string, Pick<Profile, "id" | "full_name" | "mobile">>,
): BookingAgent | null {
  if (!assignment) return null;

  const profile = assignment.agent_id
    ? profileById.get(assignment.agent_id)
    : undefined;

  return {
    id: assignment.agent_id ?? "",
    fullName: profile?.full_name ?? "Agent removed",
    mobile: profile?.mobile ?? null,
    status: assignment.status,
    assignedAt: assignment.assigned_at,
    assignedBy: assignment.assigned_by,
    automated: assignment.assigned_by_type === "auto",
  };
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function uniqueIds(values: Array<string | null>): string[] {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ];
}

function groupBy<T, K>(rows: T[], key: (row: T) => K): Map<K, T[]> {
  const grouped = new Map<K, T[]>();

  for (const row of rows) {
    const bucket = grouped.get(key(row));
    if (bucket) bucket.push(row);
    else grouped.set(key(row), [row]);
  }

  return grouped;
}

/** Statuses, re-exported so callers do not need a second import to name one. */
export type { OrderStatus };
