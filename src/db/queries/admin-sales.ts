import type {
  DbClient,
  Invoice,
  OrderItem,
  Payment,
  PickupAssignment,
  Profile,
} from "@/db/types";

import {
  buildSalesReport,
  filterPaidInvoices,
  periodWindow,
  type SalesPeriodId,
  type SalesReport,
} from "./admin-sales.view";

export * from "./admin-sales.view";

/**
 * Data access for the sales report (section 8.9).
 *
 * Reads go through the request-scoped client throughout, and nothing here needs
 * the service role: `invoices_select_by_order_visibility` and
 * `payments_select_by_invoice_visibility` already let an admin see every invoice
 * and every payment that settled it, and `orders`, `order_items` and
 * `pickup_assignments` were already readable by an admin before this module
 * existed.
 *
 * The one thing worth saying about the shape: the window is applied **after** the
 * read rather than in SQL. `paid_at` is a timestamp and the window is a set of
 * local days, so the two only agree when the comparison is done on the same day
 * key the page headings use. That is `filterPaidInvoices`, in the pure module.
 */

export type SalesOptions = {
  /**
   * Ceiling on the paid invoices considered. Inclusive of today's revenue and
   * sized so a busy store does not read its whole history to render a week; the
   * report is a rolling figure, not an archive.
   */
  limit?: number;
};

export async function buildSales(
  client: DbClient,
  period: SalesPeriodId,
  todayKey: string,
  options: SalesOptions = {},
): Promise<SalesReport> {
  const window = periodWindow(period, todayKey);
  const limit = options.limit ?? 2000;

  const { data: invoiceRows, error } = await client
    .from("invoices")
    .select("*")
    .eq("status", "paid")
    .order("paid_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  const invoices = filterPaidInvoices((invoiceRows ?? []) as Invoice[], window);

  /*
   * Nothing paid in the window is a real answer, not an error: a new store opens
   * this page before its first sale. The other four reads would have run to return
   * nothing anyway.
   */
  if (invoices.length === 0) {
    return buildSalesReport({
      invoices: [],
      items: [],
      payments: [],
      assignments: [],
      agents: [],
      window,
    });
  }

  const orderIds = [...new Set(invoices.map((invoice) => invoice.order_id))];

  const [itemsResult, paymentsResult, assignmentsResult] = await Promise.all([
    client.from("order_items").select("*").in("order_id", orderIds),
    client
      .from("payments")
      .select("*")
      .in("invoice_id", invoices.map((invoice) => invoice.id)),
    client
      .from("pickup_assignments")
      .select("*")
      .in("order_id", orderIds)
      .eq("type", "delivery"),
  ]);

  if (itemsResult.error) throw new Error(itemsResult.error.message);
  if (paymentsResult.error) throw new Error(paymentsResult.error.message);
  if (assignmentsResult.error) {
    throw new Error(assignmentsResult.error.message);
  }

  const assignments = (assignmentsResult.data ?? []) as PickupAssignment[];

  const agentIds = [
    ...new Set(
      assignments
        .map((assignment) => assignment.agent_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  // Names live on profiles, because agents.id is a profile id rather than a
  // fresh identity. Read through the client: `profiles_select_staff_public`
  // already lets any signed-in user read staff rows.
  const agentsResult =
    agentIds.length > 0
      ? await client
          .from("profiles")
          .select("id, full_name")
          .in("id", agentIds)
      : { data: [], error: null };

  if (agentsResult.error) throw new Error(agentsResult.error.message);

  return buildSalesReport({
    invoices,
    items: (itemsResult.data ?? []) as OrderItem[],
    payments: (paymentsResult.data ?? []) as Payment[],
    assignments,
    agents: (agentsResult.data ?? []) as Pick<Profile, "id" | "full_name">[],
    window,
  });
}
