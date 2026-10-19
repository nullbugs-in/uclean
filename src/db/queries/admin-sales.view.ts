import type { Invoice, OrderItem, Payment, PaymentMode, PickupAssignment, Profile } from "@/db/types";
import { toDateKey } from "@/lib/dates";

/**
 * Pure read model for the sales report (section 8.9): "Daily, weekly and monthly
 * sales by service, payment mode and agent, with CSV export".
 *
 * Every figure here is derived from an **invoice that was paid** in the window,
 * and one number is used throughout: the invoice's total. Revenue is not summed
 * from `payments` as well, because an invoice can be settled across more than one
 * payment and the two would then disagree in a way an admin would read as a bug
 * rather than as a definition. The breakdowns partition the same total, so the
 * columns add back up to the headline - which is the check that makes a report
 * worth reading.
 *
 * Walk-in orders are ordinary rows with `source = walk_in` and are included
 * without being singled out, because that is what the schema already does.
 */

export const PERIODS = ["7d", "30d", "90d", "all"] as const;

export type SalesPeriodId = (typeof PERIODS)[number];

export const PERIOD_LABEL: Record<SalesPeriodId, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  all: "All time",
};

export type SalesWindow = { from: string | null; to: string | null };

/**
 * The day window for a period.
 *
 * "7d" means the last seven days including today, so a day that is only just
 * starting is not excluded. Null `from` means no lower bound at all, which is
 * what "all time" means rather than a date in 1970.
 */
export function periodWindow(
  id: SalesPeriodId,
  todayKey: string,
): SalesWindow {
  if (id === "all") return { from: null, to: null };

  const days = id === "7d" ? 7 : id === "30d" ? 30 : 90;
  const from = new Date(`${todayKey}T00:00:00`);
  from.setDate(from.getDate() - (days - 1));

  const year = from.getFullYear();
  const month = String(from.getMonth() + 1).padStart(2, "0");
  const day = String(from.getDate()).padStart(2, "0");

  return { from: `${year}-${month}-${day}`, to: todayKey };
}

export type SalesTotals = {
  /** Sum of the paid invoice totals in the window. */
  revenue: number;
  /** How many invoices that was. */
  invoices: number;
  average: number;
};

export type ServiceRow = {
  itemName: string;
  qty: number;
  revenue: number;
};

export type ModeRow = {
  mode: PaymentMode | "unknown";
  count: number;
  revenue: number;
};

export type AgentRow = {
  agentId: string | null;
  fullName: string;
  orders: number;
  revenue: number;
};

export type SalesReport = {
  window: SalesWindow;
  totals: SalesTotals;
  byService: ServiceRow[];
  byMode: ModeRow[];
  byAgent: AgentRow[];
};

export function buildSalesReport(input: {
  invoices: Invoice[];
  items: OrderItem[];
  payments: Payment[];
  assignments: PickupAssignment[];
  agents: Pick<Profile, "id" | "full_name">[];
  window: SalesWindow;
}): SalesReport {
  const { invoices } = input;
  const revenue = invoices.reduce((sum, invoice) => sum + invoice.total, 0);

  return {
    window: input.window,
    totals: {
      revenue,
      invoices: invoices.length,
      average: invoices.length > 0 ? Math.round(revenue / invoices.length) : 0,
    },
    byService: serviceBreakdown(invoices, input.items),
    byMode: modeBreakdown(invoices, input.payments),
    byAgent: agentBreakdown(invoices, input.assignments, input.agents),
  };
}

/**
 * What was sold, across the invoices that were paid.
 *
 * The lines are read from `order_items`, which `createInvoice` replaces with the
 * catalogue lines when an invoice is raised - so an invoice's lines are the
 * record of what was billed, not of what was booked. That distinction is the
 * reason the report reads from the paid invoice's own rows rather than from the
 * customer's booking.
 */
function serviceBreakdown(
  invoices: Invoice[],
  items: OrderItem[],
): ServiceRow[] {
  const paidOrders = new Set(invoices.map((invoice) => invoice.order_id));
  const byService = new Map<string, ServiceRow>();

  for (const item of items) {
    if (!paidOrders.has(item.order_id)) continue;

    const row = byService.get(item.item_name) ?? {
      itemName: item.item_name,
      qty: 0,
      revenue: 0,
    };

    row.qty += item.qty;
    row.revenue += item.qty * item.unit_price;
    byService.set(item.item_name, row);
  }

  return [...byService.values()].sort((a, b) => b.revenue - a.revenue);
}

/**
 * How the money came in, grouped by what settled each invoice.
 *
 * An invoice with no payment row still counts, under "unknown", rather than
 * being dropped: a paid invoice with no payment is a data problem worth seeing,
 * not a reason for the columns not to add up.
 */
function modeBreakdown(
  invoices: Invoice[],
  payments: Payment[],
): ModeRow[] {
  const paidPayments = payments.filter(
    (payment) => payment.status === "collected",
  );

  const invoiceIdToMode = new Map(
    paidPayments.map((payment) => [payment.invoice_id, payment.mode]),
  );

  const byMode = new Map<string, ModeRow>();

  for (const invoice of invoices) {
    const mode = invoiceIdToMode.get(invoice.id) ?? "unknown";
    const row = byMode.get(mode) ?? { mode: mode as ModeRow["mode"], count: 0, revenue: 0 };

    row.count += 1;
    row.revenue += invoice.total;
    byMode.set(mode, row);
  }

  return [...byMode.values()].sort((a, b) => b.revenue - a.revenue);
}

/**
 * What the delivery leg carried.
 *
 * Keyed on the **delivery** assignment, not the pickup: the agent who hands the
 * laundry back is the one an admin thinks of as having taken the money, and a
 * delivery that never went out has no delivery agent at all, which lands it under
 * "Unassigned" rather than vanishing from the table.
 */
function agentBreakdown(
  invoices: Invoice[],
  assignments: PickupAssignment[],
  agents: Pick<Profile, "id" | "full_name">[],
): AgentRow[] {
  const profileById = new Map(agents.map((agent) => [agent.id, agent.full_name]));

  const agentByOrder = new Map<string, string | null>();
  for (const assignment of assignments) {
    if (assignment.type !== "delivery") continue;
    if (assignment.status === "cancelled") continue;
    agentByOrder.set(assignment.order_id, assignment.agent_id);
  }

  const byAgent = new Map<string, AgentRow>();

  for (const invoice of invoices) {
    const agentId = agentByOrder.get(invoice.order_id) ?? null;
    const key = agentId ?? "unassigned";
    const fullName = agentId ? (profileById.get(agentId) ?? "Agent removed") : "Unassigned";

    const row = byAgent.get(key) ?? { agentId, fullName, orders: 0, revenue: 0 };

    row.orders += 1;
    row.revenue += invoice.total;
    byAgent.set(key, row);
  }

  return [...byAgent.values()].sort((a, b) => b.revenue - a.revenue);
}

/**
 * The report as a CSV.
 *
 * Three sections in one file rather than three downloads, because a spreadsheet
 * wants them side by side to be any use. Every value is quoted, including the
 * ones that look safe, so a service name containing a comma cannot shift the
 * columns.
 */
export function buildSalesCsv(report: SalesReport): string {
  const rows: string[][] = [];

  rows.push(["Sales report"]);
  rows.push([
    "Window",
    report.window.from ?? "start",
    report.window.to ?? "today",
  ]);
  rows.push([]);
  rows.push(["Total", String(report.totals.revenue)]);
  rows.push(["Invoices", String(report.totals.invoices)]);
  rows.push(["Average", String(report.totals.average)]);
  rows.push([]);

  rows.push(["By service"]);
  rows.push(["Service", "Quantity", "Revenue"]);
  for (const row of report.byService) {
    rows.push([row.itemName, String(row.qty), String(row.revenue)]);
  }
  rows.push([]);

  rows.push(["By payment mode"]);
  rows.push(["Mode", "Invoices", "Revenue"]);
  for (const row of report.byMode) {
    rows.push([row.mode, String(row.count), String(row.revenue)]);
  }
  rows.push([]);

  rows.push(["By delivery agent"]);
  rows.push(["Agent", "Orders", "Revenue"]);
  for (const row of report.byAgent) {
    rows.push([row.fullName, String(row.orders), String(row.revenue)]);
  }

  return rows.map((row) => row.map(quoteCell).join(",")).join("\r\n");
}

function quoteCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** Human heading for the window, for the page. */
export function windowLabel(window: SalesWindow): string {
  if (!window.from) return "All time";
  return `${window.from} to ${window.to ?? ""}`.trim();
}

/**
 * Which paid invoices fall inside the window.
 *
 * Filtered in memory rather than with `.gte/.lt` on `paid_at` because the window
 * is a set of **local** days: comparing a timestamp against a date key cuts the
 * first day at UTC midnight and drops most of the last one, so a report run at
 * 11 PM would quietly disagree with its own heading. `toDateKey` is also what the
 * page uses to work out "today", so the boundary is defined in exactly one place.
 *
 * Unpaid invoices cannot appear here at all - `paid_at` is the timestamp that
 * makes a sale a sale - and an invoice with no `paid_at` is skipped rather than
 * being read as "the beginning of time".
 */
export function filterPaidInvoices(
  invoices: Invoice[],
  window: SalesWindow,
): Invoice[] {
  const { from, to } = window;

  if (!from || !to) return invoices;

  return invoices.filter((invoice) => {
    if (!invoice.paid_at) return false;

    const key = toDateKey(new Date(invoice.paid_at));
    return key >= from && key <= to;
  });
}
