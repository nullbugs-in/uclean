import type { DbClient, Invoice, OrderStatus } from "../types";

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
