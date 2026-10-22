import type { DbClient, Invoice, InvoiceStatus, OrderStatus } from "../types";

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

/** An invoice with the order it bills, stitched on for the list. */
export type InvoiceRow = Invoice & {
  order_no: string;
  order_status: OrderStatus;
};

/** An order that can still be invoiced, with nothing billed against it yet. */
export type BillableOrder = {
  id: string;
  order_no: string;
  customer_name: string;
  status: OrderStatus;
  created_at: string;
};

/**
 * Invoices, newest first, each with the order number and stage beside it.
 *
 * The stitch is two reads rather than an embedded select, the same shape as
 * `admin-orders.ts`: one query for the invoices, one for the orders they name,
 * joined in memory. It keeps the return type explicit instead of inferring it
 * from a select string.
 */
export async function listInvoices(
  client: Client,
  options: { limit?: number } = {},
): Promise<InvoiceRow[]> {
  const invoices = unwrap(
    await client
      .from("invoices")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(options.limit ?? 50),
  );

  if (invoices.length === 0) return [];

  const orderIds = [...new Set(invoices.map((invoice) => invoice.order_id))];

  const orders = unwrap(
    await client
      .from("orders")
      .select("id, order_no, status")
      .in("id", orderIds),
  );

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

/**
 * Orders that have no invoice yet and are not closed.
 *
 * "Billable" is not a status: an admin can bill a booking at any point before it
 * is delivered or cancelled, which is why this filters on the absence of an
 * invoice rather than on the stage.
 */
export async function listBillableOrders(
  client: Client,
  options: { limit?: number } = {},
): Promise<BillableOrder[]> {
  const orders = unwrap(
    await client
      .from("orders")
      .select("id, order_no, customer_name, status, created_at")
      .not("status", "in", "(delivered,cancelled)")
      .order("created_at", { ascending: false })
      .limit(options.limit ?? 100),
  );

  if (orders.length === 0) return [];

  const orderIds = orders.map((order) => order.id);

  const invoices = unwrap(
    await client.from("invoices").select("order_id").in("order_id", orderIds),
  );

  const billed = new Set(invoices.map((invoice) => invoice.order_id));

  return orders.filter((order) => !billed.has(order.id));
}
