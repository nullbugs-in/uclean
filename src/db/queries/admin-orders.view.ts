import type {
  InvoiceStatus,
  Order,
  OrderItem,
  OrderStatus,
  OrderStatusHistory,
} from "@/db/types";
import {
  ADMIN_TIMELINE,
  INTERNAL_STATUS_LABEL,
  ORDER_STATUSES,
} from "@/lib/order-status";

/**
 * Pure read model for the admin bookings module.
 *
 * Split from `admin-orders.ts` so it can be tested without a database, and
 * because every rule worth protecting is here rather than in SQL.
 *
 * The module is called "Bookings" in the admin panel because that is what the
 * customer is told on their own page ("My bookings"). The architecture doc calls
 * it Orders and the staff panel still does too, so the database table and the
 * shared helpers keep the `order` name throughout.
 *
 * This module is about process, not money. It answers where a booking is, who is
 * collecting it and what is in the bag, and deliberately carries no totals, no
 * estimates and no invoice state. An admin working the queue needs to know what
 * to do next, and a price is not that.
 */

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

/** Whether a booking has a pickup agent on it. */
export type AssignmentFilter = "all" | "assigned" | "unassigned";

/** How the list is ordered. Each maps to one indexed column. */
export type OrderSort = "newest" | "oldest" | "pickup";

export const ORDER_SORTS: ReadonlyArray<{ id: OrderSort; label: string }> = [
  { id: "newest", label: "Newest first" },
  { id: "oldest", label: "Oldest first" },
  { id: "pickup", label: "Pickup time" },
];

/** How many rows a page holds. Small enough that the enriched list stays one page. */
export const BOOKINGS_PAGE_SIZE = 25;

/** How many pages of links to offer either side of the current one. */
export const PAGE_WINDOW = 2;

/** How the list can be narrowed. Every field is optional and additive. */
export type OrderFilter = {
  /** A group id from `STATUS_GROUPS`; empty means every status. */
  status?: string;
  /**
   * Free text over order number, customer name and mobile.
   *
   * Split into terms so "asha 98765" narrows rather than requiring one exact
   * phrase, which is what someone scanning for a person actually types.
   */
  search?: string;
  /** Inclusive lower bound on `pickup_slot_date`, as a `YYYY-MM-DD` day key. */
  pickupFrom?: string;
  /** Inclusive upper bound on `pickup_slot_date`. */
  pickupTo?: string;
  assignment?: AssignmentFilter;
  sort?: OrderSort;
  /** One-based page number. Page 1 is the default. */
  page?: number;
};

/** Statuses an admin most often wants to look at, in machine order. */
export const STATUS_GROUPS: Array<{
  id: string;
  label: string;
  statuses: readonly OrderStatus[];
}> = [
  { id: "", label: "All", statuses: [] },
  {
    id: "collecting",
    label: "To collect",
    statuses: ["pickup_requested", "agent_assigned"],
  },
  {
    id: "at_store",
    label: "At the store",
    statuses: ["picked_up", "under_analysis"],
  },
  {
    id: "billing",
    label: "Billing",
    statuses: ["invoice_sent", "payment_pending", "paid"],
  },
  {
    id: "delivery",
    label: "Delivery",
    statuses: ["in_process", "ready_for_delivery", "out_for_delivery"],
  },
  { id: "closed", label: "Closed", statuses: ["delivered", "cancelled"] },
];

/**
 * Expands a group id into the statuses it stands for.
 *
 * A group is a set of statuses rather than one, because an admin saying "at the
 * store" means both `picked_up` and `under_analysis`. `null` means "do not
 * filter", which is how an empty selection is expressed.
 *
 * An unrecognised id reads as "all" rather than "none", so a stale bookmark
 * cannot silently blank the screen.
 */
export function expandStatusFilter(groupId: string): OrderStatus[] | null {
  const group = STATUS_GROUPS.find((entry) => entry.id === groupId);

  if (!group || group.statuses.length === 0) return null;

  return [...group.statuses];
}

/** Splits a search box into the terms to match, dropping the empty ones. */
export function searchTerms(search: string | undefined): string[] {
  return (search ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * Escapes the wildcards a user can type into an `ilike` pattern.
 *
 * Without this, searching for `%` or `_` turns the filter into a
 * match-everything or match-one-character pattern, which is both wrong and a
 * cheap way to pull the whole table back.
 */
export function escapeForIlike(term: string): string {
  return term.replace(/[%_\\]/g, (char) => `\\${char}`);
}

/**
 * Whether an order matches a search, given already-split terms.
 *
 * Every term must match somewhere across the three fields, so extra words narrow
 * the result rather than widening it. Terms of one character are ignored,
 * because that is a keystroke on the way to a longer one and matching on it
 * would make the list thrash on every keypress.
 */
export function matchesSearchTerms(order: Order, terms: string[]): boolean {
  const usable = terms.filter((term) => term.length > 1);

  if (usable.length === 0) return true;

  const haystack = [
    order.order_no,
    order.customer_name,
    order.customer_mobile ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return usable.every((term) => haystack.includes(term));
}

/** Applies a filter in memory, for tests and for the count row. */
export function applyOrderFilter(
  orders: Order[],
  filter: OrderFilter,
): Order[] {
  const statuses = filter.status ? expandStatusFilter(filter.status) : null;
  const terms = searchTerms(filter.search);

  return orders.filter((order) => {
    if (statuses && !statuses.includes(order.status)) return false;
    return matchesSearchTerms(order, terms);
  });
}

/**
 * Orders a list the way the sort control says.
 *
 * Ties break on `created_at` so the order is stable between renders: without
 * that, two bookings created in the same second could swap places every load and
 * the pagination would appear to skip rows.
 */
export function sortOrders<T extends Order>(orders: T[], sort: OrderSort): T[] {
  const sorted = [...orders];

  if (sort === "oldest") {
    return sorted.sort(
      (a, b) =>
        a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
    );
  }

  if (sort === "pickup") {
    return sorted.sort(
      (a, b) =>
        a.pickup_slot_date.localeCompare(b.pickup_slot_date) ||
        a.created_at.localeCompare(b.created_at),
    );
  }

  return sorted.sort(
    (a, b) =>
      b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id),
  );
}

/** One page of rows plus everything a pager needs to render itself. */
export function paginate<T>(rows: T[], page: number, pageSize: number) {
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  // A bookmark to page 40 of a 3-page result shows page 3 rather than an empty
  // screen, which reads as data loss rather than as an out-of-range page.
  const current = Math.min(Math.max(1, page), pageCount);
  const start = (current - 1) * pageSize;

  return {
    rows: rows.slice(start, start + pageSize),
    total,
    page: current,
    pageCount,
    hasPrevious: current > 1,
    hasNext: current < pageCount,
  };
}

/** The page numbers to link, as a centred window plus the two ends. */
export function pageWindow(page: number, pageCount: number): number[] {
  const from = Math.max(1, page - PAGE_WINDOW);
  const to = Math.min(pageCount, page + PAGE_WINDOW);

  const pages = new Set<number>([1, pageCount]);
  for (let candidate = from; candidate <= to; candidate += 1)
    pages.add(candidate);

  return [...pages].sort((a, b) => a - b);
}

/**
 * Counts each status group, given the same list it filters.
 *
 * Only for tests and for rendering over a list already in hand. The page uses
 * `getBookingSummary` instead, because counting a capped page would make the
 * figures change the moment the admin narrows the list.
 */
export function countByGroup(orders: Order[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const group of STATUS_GROUPS) {
    counts[group.id] =
      group.statuses.length === 0
        ? orders.length
        : orders.filter((order) => group.statuses.includes(order.status))
            .length;
  }

  return counts;
}

// ---------------------------------------------------------------------------
// Parsing the query string
// ---------------------------------------------------------------------------

function firstString(value: string | string[] | undefined): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate?.trim() || undefined;
}

/** A `YYYY-MM-DD` day key, or undefined for anything else. */
function dayKey(value: string | string[] | undefined): string | undefined {
  const candidate = firstString(value);

  return candidate && /^\d{4}-\d{2}-\d{2}$/.test(candidate)
    ? candidate
    : undefined;
}

/**
 * Reads the list controls out of the URL.
 *
 * Every field is validated against a fixed set rather than passed through,
 * because these values reach the query. An unknown sort would otherwise become
 * an arbitrary column name in `.order()`, and an unparseable page number would
 * become `NaN` in the offset.
 */
export function readBookingFilter(
  params: Record<string, string | string[] | undefined>,
): OrderFilter {
  const sort = firstString(params.sort);
  const assignment = firstString(params.assignment);

  const rawPage = Number(firstString(params.page) ?? "1");

  const from = dayKey(params.from);
  const to = dayKey(params.to);

  return {
    status: firstString(params.status),
    search: firstString(params.q),
    pickupFrom: from,
    // A reversed range would silently return nothing, which looks like a bug
    // rather than a mistake. Swapping the ends is what the person meant.
    pickupTo: from && to && to < from ? from : to,
    assignment: ASSIGNMENT_FILTERS.includes(assignment as AssignmentFilter)
      ? (assignment as AssignmentFilter)
      : "all",
    sort: ORDER_SORTS.some((entry) => entry.id === sort)
      ? (sort as OrderSort)
      : "newest",
    page: Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1,
  };
}

export const ASSIGNMENT_FILTERS: readonly AssignmentFilter[] = [
  "all",
  "assigned",
  "unassigned",
];

/** The current control values, for rendering links that preserve them. */
export function filterHref(
  filter: OrderFilter,
  overrides: Partial<OrderFilter> = {},
): string {
  const merged: OrderFilter = { ...filter, ...overrides };

  const params = new URLSearchParams();

  if (merged.status) params.set("status", merged.status);
  if (merged.search) params.set("q", merged.search);
  if (merged.pickupFrom) params.set("from", merged.pickupFrom);
  if (merged.pickupTo) params.set("to", merged.pickupTo);
  if (merged.assignment && merged.assignment !== "all") {
    params.set("assignment", merged.assignment);
  }
  if (merged.sort && merged.sort !== "newest") params.set("sort", merged.sort);
  if (merged.page && merged.page > 1) params.set("page", String(merged.page));

  const query = params.toString();

  return query ? `/admin/bookings?${query}` : "/admin/bookings";
}

// ---------------------------------------------------------------------------
// The enriched row
// ---------------------------------------------------------------------------

/** One page of rows plus everything a pager needs to render itself. */
export type PageResult = {
  rows: AdminOrderRow[];
  total: number;
  page: number;
  pageCount: number;
  hasPrevious: boolean;
  hasNext: boolean;
  /**
   * True when the filter matched more bookings than the query will load.
   *
   * Surfaced rather than swallowed: a truncated list is a real limit, and
   * silently showing the newest few hundred as though they were everything would
   * be worse than saying so.
   */
  truncated: boolean;
};

/** What `listAdminOrders` returns. */
export type BookingFilterResult = PageResult;

/** Whoever currently holds an assignment, resolved to a person. */
export type BookingAgent = {
  id: string;
  fullName: string;
  mobile: string | null;
  status: string;
  assignedAt: string;
  assignedBy: string | null;
  automated: boolean;
};

/**
 * One booking as the list needs it.
 *
 * Carries no money. The list is a work queue: who has this, when it is due and
 * what is in the bag. Prices are not on it, and the joins that would have
 * produced them are not run either.
 */
export type AdminOrderRow = Order & {
  /** The pickup agent, resolved through `profiles` because agents.id is one. */
  pickupAgentId: string | null;
  pickupAgentName: string | null;
  deliveryAgentId: string | null;
  deliveryAgentName: string | null;
  slotLabel: string | null;
  /** The service lines, for the summary in the list. */
  items: OrderItem[];
  /** How many distinct services were booked. */
  itemCount: number;
  /**
   * Whether an invoice already exists for this booking.
   *
   * Only existence, never the invoice itself: the card is a work queue with no
   * money on it, but the Generate Invoice button has to know whether the job was
   * already done or the invoice step was simply skipped past.
   */
  hasInvoice: boolean;
  /**
   * The generated invoice's status, when one exists.
   *
   * Null when there is no invoice. This is what splits "Invoice generated" from
   * "Send to customer" on the card: only the card itself can say whether the
   * paperwork it produced has gone out, and a sent invoice must offer its send
   * button as done rather than as `hasInvoice`'s existence does.
   */
  invoiceStatus: InvoiceStatus | null;
  /**
   * What the Analysis step recorded, taken from the `under_analysis` history
   * row's note. The invoice form opens with it so the analysis findings travel
   * with the invoice rather than living only in the log.
   */
  analysisNote: string | null;
};

/**
 * Applies the filters that need the joined data.
 *
 * Status and search happen in SQL, because the list is paginated in the database
 * and filtering afterwards would count rows the admin never saw. Assignment state
 * only exists once the assignments have been joined in, so it runs here, over
 * the full result set rather than over one page.
 */
export function applyJoinedFilters(
  rows: AdminOrderRow[],
  filter: OrderFilter,
): AdminOrderRow[] {
  const assignment = filter.assignment ?? "all";

  return rows.filter((row) => {
    if (assignment === "assigned" && row.pickupAgentId === null) return false;
    if (assignment === "unassigned" && row.pickupAgentId !== null) return false;

    return true;
  });
}

// ---------------------------------------------------------------------------
// Summary figures
// ---------------------------------------------------------------------------

/**
 * The headline counts, each a real `count(*)`.
 *
 * Deliberately independent of whatever the admin has filtered. Counting the
 * visible list would make the figures describe the filter rather than the
 * business, so "12 awaiting pickup" would quietly become "3 awaiting pickup"
 * the moment someone searched a name.
 */
export type BookingSummary = {
  total: number;
  awaitingPickup: number;
  inProgress: number;
  readyForDelivery: number;
  delivered: number;
  /** Awaiting pickup or in progress: the number that says how busy today is. */
  open: number;
};

/** The statuses behind each summary figure, so the queries cannot disagree. */
export const SUMMARY_GROUPS: ReadonlyArray<{
  key: keyof Omit<BookingSummary, "total" | "open">;
  statuses: readonly OrderStatus[];
}> = [
  {
    key: "awaitingPickup",
    statuses: ["pickup_requested", "agent_assigned"],
  },
  {
    key: "inProgress",
    statuses: [
      "picked_up",
      "under_analysis",
      "invoice_sent",
      "payment_pending",
      "paid",
      "in_process",
    ],
  },
  { key: "readyForDelivery", statuses: ["ready_for_delivery"] },
  { key: "delivered", statuses: ["delivered"] },
];

// ---------------------------------------------------------------------------
// The status log and the timeline
// ---------------------------------------------------------------------------

/**
 * The status log an admin reads: internal names, newest first.
 *
 * Distinct from the customer timeline on purpose. That one renders only the eight
 * `CUSTOMER_TIMELINE` steps in customer wording, so it hides `picked_up`,
 * `payment_pending` and `paid` entirely and carries no actor. This is the record
 * the architecture doc asks the admin to see: who, when, from, to.
 */
export function orderStatusLog(
  history: OrderStatusHistory[],
  actorNames: Record<string, string>,
): Array<{
  from: OrderStatus | null;
  to: OrderStatus;
  label: string;
  actor: string | null;
  note: string | null;
  at: string;
}> {
  return [...history]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((entry) => ({
      from: entry.from_status,
      to: entry.to_status,
      label: INTERNAL_STATUS_LABEL[entry.to_status],
      // A removed actor resolves to nothing, because their profile row is gone.
      // Inventing an "Unknown" label would be a guess; saying nothing is honest.
      actor: entry.changed_by ? (actorNames[entry.changed_by] ?? null) : null,
      note: entry.note,
      at: entry.created_at,
    }));
}

export type TimelineStepState = "done" | "current" | "upcoming" | "skipped";

export type TimelineStep = {
  status: OrderStatus;
  label: string;
  state: TimelineStepState;
  /** When it was reached, if it was. */
  at: string | null;
  /** Who moved it there, if known. */
  actor: string | null;
  note: string | null;
};

/**
 * The vertical progress timeline: completed, current, and what is still ahead.
 *
 * Forward-looking, unlike `orderStatusLog`, which is a record of what happened.
 * The admin brief asks for both — the bar to answer "where is this", and the log
 * to answer "who put it there".
 *
 * Built on `ADMIN_TIMELINE` rather than `CUSTOMER_TIMELINE`, because an admin
 * needs to see the payment stages that the customer's version deliberately hides.
 *
 * "Skipped" is for a stage the booking never passed through, which is normal: a
 * `paid` booking never goes through `payment_pending`, and a cash-on-delivery
 * booking never stops at `invoice_sent` at all. Rendering those as merely
 * "upcoming" after the booking has moved past them would show a permanently
 * incomplete bar.
 */
export function buildTimeline(
  status: OrderStatus,
  history: OrderStatusHistory[],
  actorNames: Record<string, string> = {},
): TimelineStep[] {
  const reached = new Map<OrderStatus, OrderStatusHistory>();

  for (const entry of history) {
    // The first row for a status is the moment it was reached.
    if (!reached.has(entry.to_status)) reached.set(entry.to_status, entry);
  }

  // A cancelled booking has no current stage on this list, so it is not given
  // one. The timeline still shows what it reached before it was cancelled, and
  // the UI renders the cancellation as a separate banner rather than as a
  // twelfth step, because the cancellation happened outside the happy path.
  const currentIndex =
    status === "cancelled" ? -1 : ADMIN_TIMELINE.indexOf(status);

  return ADMIN_TIMELINE.map((step, index) => {
    const entry = reached.get(step);

    /*
     * The current stage is tested before "reached", deliberately. The trigger
     * writes a history row the instant the status changes, so the current stage
     * almost always has one — and testing `reached` first would render the stage
     * the booking is sitting on as completed, which is exactly the wrong answer
     * to "where is this".
     */
    let state: TimelineStepState;
    if (step === status) state = "current";
    else if (entry) state = "done";
    else if (index < currentIndex) state = "skipped";
    else state = "upcoming";

    return {
      status: step,
      label: INTERNAL_STATUS_LABEL[step],
      state,
      at: entry?.created_at ?? null,
      actor: entry?.changed_by ? (actorNames[entry.changed_by] ?? null) : null,
      note: entry?.note ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/**
 * The WhatsApp message a status change queues, from the trigger's own mapping.
 *
 * `handle_order_status_change` in migration 08 picks a notification template per
 * target status and queues it for the customer. An admin pressing a button does
 * not know that, so this says it out loud rather than letting them message a
 * customer they did not intend to.
 *
 * Mirrors the SQL case expression and must be changed with it, the same way
 * `src/lib/order-status.ts` mirrors `allowed_order_transition`.
 */
export function notificationForStatus(status: OrderStatus): {
  template: string;
  customerIsTold: boolean;
} {
  switch (status) {
    case "pickup_requested":
      return { template: "order_confirmed", customerIsTold: true };
    case "agent_assigned":
      return { template: "agent_assigned", customerIsTold: true };
    case "picked_up":
      return { template: "picked_up", customerIsTold: true };
    case "invoice_sent":
      return { template: "invoice_ready", customerIsTold: true };
    case "paid":
    case "payment_pending":
      return { template: "payment_received", customerIsTold: true };
    case "out_for_delivery":
      return { template: "out_for_delivery", customerIsTold: true };
    case "delivered":
      return { template: "delivered", customerIsTold: true };
    default:
      // under_analysis, in_process and ready_for_delivery map to null in SQL, so
      // no message goes out. Saying so beats implying one did.
      return { template: "", customerIsTold: false };
  }
}

// ---------------------------------------------------------------------------
// Guards on the item lines
// ---------------------------------------------------------------------------

/**
 * Whether the item lines may still be edited.
 *
 * Billing owns the numbers once it has generated an invoice: `createInvoice`
 * deletes every `order_items` row for the order and inserts its own, so anything
 * an admin edited would be silently discarded. Rather than warn and let it
 * happen, the lines lock.
 *
 * A closed order locks too, for a different reason: nothing about a delivered
 * or cancelled order should still be editable.
 */
export function canEditOrderItems(input: {
  hasInvoice: boolean;
  status: OrderStatus;
}): { editable: boolean; reason: string | null } {
  if (input.hasInvoice) {
    return {
      editable: false,
      reason:
        "An invoice has been generated for this order, so the lines are locked to what was billed.",
    };
  }

  if (input.status === "delivered" || input.status === "cancelled") {
    return {
      editable: false,
      reason: "This order is closed, so its lines can no longer be changed.",
    };
  }

  return { editable: true, reason: null };
}

/** Running total of the lines, which is an estimate until an invoice exists. */
export function itemsTotal(items: OrderItem[]): number {
  return items.reduce((total, item) => total + item.qty * item.unit_price, 0);
}

// ---------------------------------------------------------------------------
// The booking card's two buttons
// ---------------------------------------------------------------------------

export type BookingCardActionState = {
  /**
   * The Analysis button: `locked` before the pickup, `ready` from `picked_up`
   * until the analysis is recorded, `done` once it is on the timeline.
   */
  analysis: "locked" | "ready" | "done";
  /** Why the Analysis button is disabled, when it is. */
  analysisReason: string | null;
  /**
   * The Generate Invoice button: `ready` only between a recorded analysis and a
   * generated invoice.
   */
  invoice: "locked" | "ready" | "done";
  /** Why the Generate Invoice button is disabled, when it is. */
  invoiceReason: string | null;
  /**
   * The Send to Customer button: `locked` while no invoice exists, `ready` on a
   * generated-but-unsent invoice, `done` once it is sent.
   */
  send: "locked" | "ready" | "done";
  /** Why the Send to Customer button is disabled, when it is. */
  sendReason: string | null;
};

/**
 * Gating for the two quick actions on a list card.
 *
 * The card reads the booking, not the paperwork around it, so the gates are
 * stages rather than features: analysis is available the moment the laundry is
 * in the store (`picked_up`), and invoicing is available the moment the analysis
 * is recorded (`under_analysis`) and there is no invoice yet. Everything is
 * derived from `{ status, hasInvoice }` so it can be tested without a database
 * and never drift from what the row actually says.
 *
 * These gates do not replace the database's: the state machine in SQL and the
 * `expectedStatus` conflict check still decide whether a press is legal. This is
 * only so the button tells the truth about why it is grey.
 */
export function bookingCardActions(input: {
  status: OrderStatus;
  hasInvoice: boolean;
  /** The invoice's own status when one exists; null (or omitted) when not. */
  invoiceStatus?: InvoiceStatus | null;
}): BookingCardActionState {
  const { status, hasInvoice } = input;
  /*
   * An invoice row without a status select (the pre-split shape) is treated as
   * an unsent draft: before the send step existed, existence and "not yet sent"
   * were the same fact.
   */
  const invoiceStatus: InvoiceStatus | null = hasInvoice
    ? (input.invoiceStatus ?? "draft")
    : null;
  const sent = invoiceStatus === "sent" || invoiceStatus === "paid";

  let analysis: BookingCardActionState["analysis"];
  let analysisReason: string | null;

  if (status === "pickup_requested" || status === "agent_assigned") {
    analysis = "locked";
    analysisReason = "Available once the pickup is completed.";
  } else if (status === "cancelled") {
    analysis = "locked";
    analysisReason = "This booking was cancelled.";
  } else if (status === "picked_up") {
    analysis = "ready";
    analysisReason = null;
  } else {
    analysis = "done";
    analysisReason = null;
  }

  let invoice: BookingCardActionState["invoice"];
  let invoiceReason: string | null;

  if (hasInvoice) {
    invoice = "done";
    invoiceReason = null;
  } else if (status === "under_analysis") {
    invoice = "ready";
    invoiceReason = null;
  } else if (status === "cancelled") {
    invoice = "locked";
    invoiceReason = "This booking was cancelled.";
  } else if (
    status === "pickup_requested" ||
    status === "agent_assigned" ||
    status === "picked_up"
  ) {
    invoice = "locked";
    invoiceReason = "Available once the analysis is completed.";
  } else {
    // The analysis window has passed without an invoice. The card cannot raise
    // one, and pointing that out beats a button that lies with a generic grey.
    invoice = "locked";
    invoiceReason =
      "Not available at this stage. Raise it on Billing if needed.";
  }

  let send: BookingCardActionState["send"];
  let sendReason: string | null;

  if (!hasInvoice) {
    send = "locked";
    sendReason = "Generate the invoice first, then send it to the customer.";
  } else if (sent) {
    send = "done";
    sendReason = null;
  } else if (status === "cancelled") {
    send = "locked";
    sendReason = "This booking was cancelled.";
  } else {
    // An unsent invoice, otherwise: generation already produces the secure
    // link, so sending is available to the whole rest of the booking's life.
    send = "ready";
    sendReason = null;
  }

  return {
    analysis,
    analysisReason,
    invoice,
    invoiceReason,
    send,
    sendReason,
  };
}

/** Every status, in machine order. */
export const ALL_ORDER_STATUSES = ORDER_STATUSES;
