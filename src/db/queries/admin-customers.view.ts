import type { Order, OrderStatus, Profile } from "@/db/types";

import { escapeForIlike, pageWindow, searchTerms } from "./admin-orders.view";

// The pager primitives are not customers-specific, so they are re-exported
// here rather than copied: the list component needs `pageWindow` alongside the
// rest of this module's API, and duplicating it would let the two drift.
export { pageWindow };

/**
 * Pure read model for the admin customers module (architecture doc, section
 * 7.2.2: "profile details, order history").
 *
 * Split from `admin-customers.ts` for the same reason `admin-orders.view.ts` is
 * split from `admin-orders.ts`: every rule worth protecting is testable here
 * without a database. The list primitives that are not customers-specific
 * (`escapeForIlike`, `searchTerms`) are imported from the bookings view rather
 * than copied, so a customers list and a bookings list behave the same way.
 *
 * This module reads people, not process and not money. Order figures below are
 * the only booking data it carries, and they are counts and dates, never prices.
 */

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

/** How the customer list is ordered. Each maps to one indexed column. */
export type CustomerSort = "newest" | "oldest" | "name";

export const CUSTOMER_SORTS: ReadonlyArray<{
  id: CustomerSort;
  label: string;
}> = [
  { id: "newest", label: "Newest first" },
  { id: "oldest", label: "Oldest first" },
  { id: "name", label: "Name A-Z" },
];

/** How many customers a page holds. */
export const CUSTOMER_PAGE_SIZE = 25;

/** How the list can be narrowed. Every field is optional. */
export type CustomerFilter = {
  /**
   * Free text over name, mobile, WhatsApp number and email.
   *
   * Split into terms, matching the bookings search, so "asha 98765" reads as a
   * person rather than as one impossible phrase.
   */
  search?: string;
  sort?: CustomerSort;
  /** One-based page number. Page 1 is the default. */
  page?: number;
};

function firstString(value: string | string[] | undefined): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate?.trim() || undefined;
}

/**
 * Reads the list controls out of the URL.
 *
 * Every field is validated against a fixed set rather than passed through,
 * because these values reach the query: an unknown sort would otherwise become
 * an arbitrary column name in `.order()`, and an unparseable page number would
 * become `NaN` in the offset.
 */
export function readCustomerFilter(
  params: Record<string, string | string[] | undefined>,
): CustomerFilter {
  const sort = firstString(params.sort);
  const rawPage = Number(firstString(params.page) ?? "1");

  return {
    search: firstString(params.q),
    sort: CUSTOMER_SORTS.some((entry) => entry.id === sort)
      ? (sort as CustomerSort)
      : "newest",
    page: Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1,
  };
}

/** The current control values, for rendering links that preserve them. */
export function customerFilterHref(
  filter: CustomerFilter,
  overrides: Partial<CustomerFilter> = {},
): string {
  const merged: CustomerFilter = { ...filter, ...overrides };

  const params = new URLSearchParams();

  if (merged.search) params.set("q", merged.search);
  if (merged.sort && merged.sort !== "newest") params.set("sort", merged.sort);
  if (merged.page && merged.page > 1) params.set("page", String(merged.page));

  const query = params.toString();

  return query ? `/admin/customers?${query}` : "/admin/customers";
}

/**
 * The `or` clause that narrows a profile search, or `null` for no search.
 *
 * One OR group across every term and every searchable field, matching how the
 * bookings list builds its search. Wildcards typed by a user are escaped, so a
 * `%` cannot widen the match back to the whole table. One-character terms are
 * dropped, because that is a keystroke on the way to a longer one.
 */
export function customerSearchOrClause(
  search: string | undefined,
): string | null {
  const terms = searchTerms(search).filter((term) => term.length > 1);

  if (terms.length === 0) return null;

  return terms
    .map((term) => {
      const safe = escapeForIlike(term);
      return (
        `full_name.ilike.%${safe}%,` +
        `mobile.ilike.%${safe}%,` +
        `whatsapp_number.ilike.%${safe}%,` +
        `email.ilike.%${safe}%`
      );
    })
    .join(",");
}

// ---------------------------------------------------------------------------
// The enriched row
// ---------------------------------------------------------------------------

/**
 * One customer as the list needs them.
 *
 * The profile is unchanged; the three order fields are a roll-up of that
 * customer's bookings, which is what lets an admin tell an active account from
 * one that signed up and never booked.
 */
export type AdminCustomerRow = Profile & {
  /** How many bookings this customer has placed, in any state. */
  orderCount: number;
  /** When their most recent booking was placed, or null if they have none. */
  lastOrderAt: string | null;
  /** That booking's status, drawn as a pill in the list. */
  lastOrderStatus: OrderStatus | null;
};

/** What `listAdminCustomers` returns. */
export type CustomerFilterResult = {
  rows: AdminCustomerRow[];
  total: number;
  page: number;
  pageCount: number;
  hasPrevious: boolean;
  hasNext: boolean;
};

/**
 * Folds a customer's orders into a count, a most-recent date and its status.
 *
 * Deliberately tolerant of more than one order per customer: the caller reads
 * every order for the page in one query and this picks the newest per customer,
 * so a customer with twenty bookings still produces a single row.
 */
export function attachOrderStats(
  profiles: Profile[],
  orders: Array<Pick<Order, "customer_id" | "created_at" | "status">>,
): AdminCustomerRow[] {
  const byCustomer = new Map<
    string,
    { count: number; lastAt: string | null; lastStatus: OrderStatus | null }
  >();

  for (const order of orders) {
    const current = byCustomer.get(order.customer_id);

    if (!current) {
      byCustomer.set(order.customer_id, {
        count: 1,
        lastAt: order.created_at,
        lastStatus: order.status,
      });
      continue;
    }

    current.count += 1;

    if (!current.lastAt || order.created_at > current.lastAt) {
      current.lastAt = order.created_at;
      current.lastStatus = order.status;
    }
  }

  return profiles.map((profile) => {
    const stats = byCustomer.get(profile.id);

    return {
      ...profile,
      orderCount: stats?.count ?? 0,
      lastOrderAt: stats?.lastAt ?? null,
      lastOrderStatus: stats?.lastStatus ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Summary figures
// ---------------------------------------------------------------------------

/**
 * The headline counts for the top of the list.
 *
 * Each is a `count(*)` about the business, not about the visible page, so the
 * figures do not change when an admin narrows the list.
 */
export type CustomerSummary = {
  total: number;
  newThisMonth: number;
  /** Signed up in the last seven days. */
  newThisWeek: number;
};

/** The roll-up shown on a single customer's page. */
export type CustomerDetailSummary = {
  total: number;
  delivered: number;
  cancelled: number;
  /** Placed and not yet delivered or cancelled. */
  open: number;
  lastOrderAt: string | null;
};

/**
 * Counts a customer's bookings by state and finds the newest one.
 *
 * "Open" is the one to read first: it is the customer's work still in the
 * system. Delivered and cancelled are closed and counted separately so the three
 * always add up to the total, whatever states the bookings are in.
 */
export function summarizeCustomerOrders(
  orders: Array<Pick<Order, "status" | "created_at">>,
): CustomerDetailSummary {
  let delivered = 0;
  let cancelled = 0;
  let open = 0;
  let lastOrderAt: string | null = null;

  for (const order of orders) {
    if (order.status === "delivered") delivered += 1;
    else if (order.status === "cancelled") cancelled += 1;
    else open += 1;

    if (!lastOrderAt || order.created_at > lastOrderAt) {
      lastOrderAt = order.created_at;
    }
  }

  return {
    total: orders.length,
    delivered,
    cancelled,
    open,
    lastOrderAt,
  };
}
