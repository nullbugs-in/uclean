import type { DbClient, InvoiceStatus, OrderStatus } from "../types";

import { assembleInvoiceRows, type InvoiceRow } from "./billing.view";

export * from "./billing.view";

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

/** The booking-side shape the invoice form bills against. */
export type BillableOrder = {
  id: string;
  order_no: string;
  customer_name: string;
  status: OrderStatus;
  created_at: string;
};

/**
 * The whole invoice history, newest first, each with the order number and stage
 * beside it.
 *
 * Billing answers "every bill this store has raised", so there is no cap on the
 * read: a 50-invoice window would quietly hide paid history behind the freshest
 * rows. The stitch is two reads rather than an embedded select, the same shape
 * as `admin-orders.ts`: one query for the invoices, one for the orders they
 * name, joined in memory by the pure stitch in `billing.view.ts`. It keeps the
 * return type explicit instead of inferring it from a select string.
 */
export async function listInvoices(
  client: Client,
): Promise<InvoiceRow[]> {
  const invoices = unwrap(
    await client
      .from("invoices")
      .select("*")
      .order("created_at", { ascending: false }),
  );

  if (invoices.length === 0) return [];

  const orderIds = [...new Set(invoices.map((invoice) => invoice.order_id))];

  const orders = unwrap(
    await client
      .from("orders")
      .select("id, order_no, status")
      .in("id", orderIds),
  );

  return assembleInvoiceRows(invoices, orders);
}

/**
 * The invoice a customer or staff member sees on a booking card.
 *
 * Deliberately narrow: `pay_token` is the one credential `/pay/[token]` needs
 * and the rest is what a card can caption itself with. Only the token column —
 * and nothing else sensitive — is exposed, and the query never runs for an
 * empty id list, which PostgREST would reject with an unhelpful error.
 */
export type OrderInvoiceView = {
  order_id: string;
  invoice_no: string;
  total: number;
  status: InvoiceStatus;
  pay_token: string | null;
};

/**
 * One booking card's worth of invoice state, for a batch of orders.
 *
 * RLS decides what returns: a customer reaches only the invoices on their own
 * orders, assigned staff only those on the orders they hold. An invoice is
 * linked from the card once it has been sent — before that the token still
 * means something, but a draft's link is admin business, not the customer's.
 */
export async function listInvoicesForOrders(
  client: Client,
  orderIds: string[],
): Promise<OrderInvoiceView[]> {
  if (orderIds.length === 0) return [];

  return unwrap(
    await client
      .from("invoices")
      .select("order_id, invoice_no, total, status, pay_token")
      .in("order_id", orderIds),
  );
}

