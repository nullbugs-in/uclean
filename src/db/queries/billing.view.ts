import type { Invoice, Order } from "../types";

import { searchTerms } from "./admin-orders.view";

/** Shared search splitting, re-exported so billing callers have one import. */
export { searchTerms };

/**
 * Pure read model for the Billing page's invoice history.
 *
 * Billing is the one place the whole ledger lives: every invoice the store has
 * generated, whatever stage each is at. The rows are fetched in full (there is
 * no sensible cap on "all the money we have billed"), so everything below
 * filters and counts in memory, and the query layer stays two reads plus a
 * stitch — the same split the notifications log uses.
 */

/** An invoice with the order it bills, stitched on for the list. */
export type InvoiceRow = Invoice & {
  order_no: string;
  order_status: Order["status"];
};

/**
 * Stitches each invoice onto its booking.
 *
 * An order the book no longer holds must not drop its invoice — the bill is the
 * record that matters — so a missing order renders as the bare id and the
 * earliest stage rather than disappearing.
 */
export function assembleInvoiceRows(
  invoices: Invoice[],
  orders: Pick<Order, "id" | "order_no" | "status">[],
): InvoiceRow[] {
  const byId = new Map(orders.map((order) => [order.id, order]));

  return invoices.map((invoice) => {
    const order = byId.get(invoice.order_id);

    return {
      ...invoice,
      order_no: order?.order_no ?? invoice.order_id,
      order_status: order?.status ?? "pickup_requested",
    };
  });
}

export const INVOICE_FILTERS = [
  "all",
  "draft",
  "sent",
  "paid",
  "void",
] as const;

export type InvoiceStatusFilter = (typeof INVOICE_FILTERS)[number];

export const INVOICE_FILTER_LABEL: Record<InvoiceStatusFilter, string> = {
  all: "All",
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  void: "Void",
};

/** Reads the status control out of the URL; anything unknown falls back to all. */
export function readInvoiceStatusFilter(
  value: string | string[] | undefined,
): InvoiceStatusFilter {
  const candidate = Array.isArray(value) ? value[0] : value;
  return INVOICE_FILTERS.includes(candidate as InvoiceStatusFilter)
    ? (candidate as InvoiceStatusFilter)
    : "all";
}

/** Where a chip points. Chips are the only control in the URL, so no merging. */
export function invoiceFilterHref(status: InvoiceStatusFilter): string {
  return status === "all"
    ? "/admin/billing"
    : `/admin/billing?status=${status}`;
}

/** Applies the status chip in memory, for tests and for the visible table. */
export function applyInvoiceStatusFilter(
  rows: InvoiceRow[],
  filter: InvoiceStatusFilter,
): InvoiceRow[] {
  if (filter === "all") return rows;
  return rows.filter((row) => row.status === filter);
}

/**
 * Whether an invoice matches the search box, given already-split terms.
 *
 * Every term must land somewhere across the fields an admin would try — the
 * bill number, the booking number or the customer — so extra words narrow the
 * result rather than widening it. Single-character terms are ignored, the same
 * keystroke rule the bookings list applies.
 */
export function matchesInvoiceSearch(
  row: InvoiceRow,
  terms: string[],
): boolean {
  const usable = terms.filter((term) => term.length > 1);

  if (usable.length === 0) return true;

  const haystack = [row.invoice_no, row.order_no, row.customer_name]
    .join(" ")
    .toLowerCase();

  return usable.every((term) => haystack.includes(term));
}

export type InvoiceCounts = {
  all: number;
  draft: number;
  sent: number;
  paid: number;
  void: number;
  /** Total across invoices the store expects to settle, sent or paid. */
  billed: number;
  /** The slice of that which is already settled as paid. */
  collected: number;
};

/**
 * Counts the whole history, not the searched slice.
 *
 * Draft bills carry no money — nothing has been issued — and a voided bill
 * releases its figure back, so both stay out of the sums while keeping their
 * own counts.
 */
export function countInvoices(rows: InvoiceRow[]): InvoiceCounts {
  const counts: InvoiceCounts = {
    all: rows.length,
    draft: 0,
    sent: 0,
    paid: 0,
    void: 0,
    billed: 0,
    collected: 0,
  };

  for (const { status, total } of rows) {
    counts[status] += 1;
    if (status === "paid") {
      counts.billed += total;
      counts.collected += total;
    } else if (status === "sent") {
      counts.billed += total;
    }
  }

  return counts;
}
