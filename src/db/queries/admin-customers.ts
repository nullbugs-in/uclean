import type { Address, DbClient, Order, Profile } from "@/db/types";

import {
  CUSTOMER_PAGE_SIZE,
  attachOrderStats,
  customerSearchOrClause,
  summarizeCustomerOrders,
  type AdminCustomerRow,
  type CustomerDetailSummary,
  type CustomerFilter,
  type CustomerFilterResult,
  type CustomerSummary,
} from "./admin-customers.view";

export * from "./admin-customers.view";

/**
 * Data access for the admin customers module (architecture doc, section 7.2.2).
 *
 * Kept apart from `db/queries/profiles.ts`, which the customer panel and the
 * booking wizard read, so nothing here can change what those see. An admin sees
 * every customer profile and every order; a customer sees only their own. That
 * difference lives in the RLS policies, not here — `is_admin()` already
 * satisfies the select policies on `profiles`, `orders` and `addresses`, so
 * nothing in this module needs the service role.
 *
 * Reads go through the request-scoped client throughout.
 */

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

/**
 * Every customer matching a filter, plus the page the UI should show.
 *
 * Status, search, the sort and the pagination all happen in SQL against
 * indexed columns: `profiles(role)` narrows to customers, and `created_at` and
 * `full_name` are the two orderings offered. `count: "exact"` reports how many
 * rows matched overall even though only one page comes back, which is what keeps
 * the pager honest without loading the whole customer book into memory.
 */
export async function listAdminCustomers(
  client: DbClient,
  filter: CustomerFilter = {},
  options: { pageSize?: number } = {},
): Promise<CustomerFilterResult> {
  const pageSize = options.pageSize ?? CUSTOMER_PAGE_SIZE;
  const requested = Math.max(1, filter.page ?? 1);

  let result = await loadPage(client, filter, requested, pageSize);

  const pageCount = Math.max(1, Math.ceil(result.count / pageSize));
  let page = requested;

  /*
   * A bookmarked page past the end shows the last page rather than an empty
   * screen. An empty result with a real total is a page number problem, not an
   * empty customer book, and rendering "no customers" would be the wrong answer.
   */
  if (result.rows.length === 0 && requested > pageCount && result.count > 0) {
    page = pageCount;
    result = await loadPage(client, filter, page, pageSize);
  }

  const rows = await attachOrders(client, result.rows);

  return {
    rows,
    total: result.count,
    page,
    pageCount,
    hasPrevious: page > 1,
    hasNext: page < pageCount,
  };
}

/**
 * Runs one page of the filtered customer query.
 *
 * Built as its own function so the out-of-range retry above can re-run it
 * against the last page without rebuilding the filter by hand.
 */
async function loadPage(
  client: DbClient,
  filter: CustomerFilter,
  page: number,
  pageSize: number,
): Promise<{ rows: Profile[]; count: number }> {
  let query = client
    .from("profiles")
    .select("*", { count: "exact" })
    .eq("role", "customer");

  const search = customerSearchOrClause(filter.search);
  if (search) query = query.or(search);

  const sort = filter.sort ?? "newest";

  if (sort === "name") {
    query = query
      .order("full_name", { ascending: true })
      // Ties break on id so the order is stable between renders. Without it,
      // two customers saved in the same second could swap places every load.
      .order("id", { ascending: true });
  } else if (sort === "oldest") {
    query = query
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
  } else {
    query = query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
  }

  const from = (page - 1) * pageSize;
  const { data, error, count } = await query.range(from, from + pageSize - 1);

  if (error) throw new Error(error.message);

  return { rows: (data ?? []) as Profile[], count: count ?? 0 };
}

/**
 * Folds each customer's bookings onto their row.
 *
 * One `in (...)` query for the whole page, however many customers are on it, so
 * this stays a fixed two round trips rather than one per customer.
 */
async function attachOrders(
  client: DbClient,
  profiles: Profile[],
): Promise<AdminCustomerRow[]> {
  if (profiles.length === 0) return [];

  const { data, error } = await client
    .from("orders")
    .select("customer_id, created_at, status")
    .in("customer_id", profiles.map((profile) => profile.id));

  if (error) throw new Error(error.message);

  return attachOrderStats(
    profiles,
    (data ?? []) as Array<Pick<Order, "customer_id" | "created_at" | "status">>,
  );
}

// ---------------------------------------------------------------------------
// Summary figures
// ---------------------------------------------------------------------------

/**
 * The headline counts at the top of the list.
 *
 * Three parallel `head: true` selects, so they cost three index scans and fetch
 * no rows. Taken from the database rather than from whatever page is on screen,
 * so the figures describe the customer book and not the current filter.
 */
export async function getCustomerSummary(
  client: DbClient,
): Promise<CustomerSummary> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [total, newThisMonth, newThisWeek] = await Promise.all([
    countCustomers(client),
    countCustomers(client, monthStart),
    countCustomers(client, weekStart),
  ]);

  return { total, newThisMonth, newThisWeek };
}

async function countCustomers(client: DbClient, since?: Date): Promise<number> {
  let query = client
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "customer");

  if (since) query = query.gte("created_at", since.toISOString());

  const { count, error } = await query;

  if (error) throw new Error(error.message);
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// One customer in full
// ---------------------------------------------------------------------------

/** What `getAdminCustomerDetail` returns. */
export type AdminCustomerDetail = {
  profile: Profile;
  addresses: Address[];
  orders: Array<Order & { slotLabel: string | null }>;
  summary: CustomerDetailSummary;
};

/**
 * One customer with their saved addresses and every booking they have placed.
 *
 * The booking rows keep the slot label resolved, so the order history reads the
 * same way it does on the bookings list without a second round trip per row.
 *
 * Only a `role = "customer"` profile resolves. An admin who opens a staff or
 * admin id gets `null` and therefore a 404, which keeps this screen from
 * doubling as a staff directory.
 */
export async function getAdminCustomerDetail(
  client: DbClient,
  customerId: string,
): Promise<AdminCustomerDetail | null> {
  const profileResult = await client
    .from("profiles")
    .select("*")
    .eq("id", customerId)
    .eq("role", "customer")
    .maybeSingle();

  if (profileResult.error) throw new Error(profileResult.error.message);
  if (!profileResult.data) return null;

  const [addressResult, orderResult] = await Promise.all([
    client
      .from("addresses")
      .select("*")
      .eq("user_id", customerId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false }),
    client
      .from("orders")
      .select("*")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false }),
  ]);

  if (addressResult.error) throw new Error(addressResult.error.message);
  if (orderResult.error) throw new Error(orderResult.error.message);

  const addresses = (addressResult.data ?? []) as Address[];
  const orders = (orderResult.data ?? []) as Order[];

  /*
   * Slots are read once for every booking rather than per booking, and read by
   * label alone. An order keeps its pickup window after an admin switches that
   * slot off, so the label is not filtered on `is_active`.
   */
  const slotIds = [...new Set(orders.map((order) => order.pickup_slot_id))];

  const slots =
    slotIds.length > 0
      ? ((
          await client
            .from("time_slots")
            .select("id, label, start_time, end_time")
            .in("id", slotIds)
        ).data ?? [])
      : [];

  const slotLabel = new Map(
    slots.map((slot) => [
      slot.id,
      slot.label ?? `${slot.start_time}-${slot.end_time}`,
    ]),
  );

  return {
    profile: profileResult.data as Profile,
    addresses,
    orders: orders.map((order) => ({
      ...order,
      slotLabel: slotLabel.get(order.pickup_slot_id) ?? null,
    })),
    summary: summarizeCustomerOrders(orders),
  };
}
