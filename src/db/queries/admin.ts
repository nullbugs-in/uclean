import { addDays, fromDateKey, toDateKey } from "@/lib/dates";

import type { DbClient, InvoiceStatus } from "../types";

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

const INVOICE_STATUSES: readonly InvoiceStatus[] = [
  "draft",
  "sent",
  "paid",
  "void",
];

export type RevenueOverview = {
  /** Cash actually collected on the chosen day. */
  collectedToday: number;
  /** One entry per day in the window, oldest first, so quiet days show as 0. */
  collected: Array<{ date: string; amount: number }>;
  /** Invoiced but not yet settled, in rupees. */
  outstanding: number;
  /** How many invoices are sitting sent and unpaid. */
  awaitingPayment: number;
  /** Invoices by status, for the mix chart. */
  invoiceMix: Array<{ status: InvoiceStatus; count: number }>;
};

/**
 * Money view for the admin dashboard.
 *
 * Worth being precise about what "collected" means: a row counts only when its
 * payment is `collected`, so an invoice sent to a customer contributes nothing
 * until cash or a gateway confirmation actually lands. That keeps the headline
 * figure honest against the outstanding number next to it, which is the same
 * invoices still waiting.
 *
 * Day boundaries are local, because the store closes on a local day and not on
 * UTC's. The window filter is built from local midnight and then converted to
 * an instant, which is what keeps the rows fetched and the buckets they land in
 * on the same clock.
 */
export async function getRevenueOverview(
  client: Client,
  options: { day?: string; days?: number } = {},
): Promise<RevenueOverview> {
  const days = Math.max(1, options.days ?? 7);
  const day = options.day ?? toDateKey(new Date());
  const windowStart = addDays(fromDateKey(day), -(days - 1));

  const [paymentsResult, invoicesResult] = await Promise.all([
    client
      .from("payments")
      .select("amount, collected_at")
      .eq("status", "collected")
      .gte("collected_at", windowStart.toISOString()),
    client.from("invoices").select("total, status"),
  ]);

  const payments = unwrap(paymentsResult);
  const invoices = unwrap(invoicesResult);

  const collected = Array.from({ length: days }, (_, index) => ({
    date: toDateKey(addDays(windowStart, index)),
    amount: 0,
  }));
  const bucketByDate = new Map(collected.map((entry) => [entry.date, entry]));

  let collectedToday = 0;
  for (const payment of payments) {
    if (!payment.collected_at) continue;

    const key = toDateKey(new Date(payment.collected_at));
    const amount = Number(payment.amount);

    const bucket = bucketByDate.get(key);
    if (bucket) bucket.amount += amount;
    if (key === day) collectedToday += amount;
  }

  const countByStatus = new Map<InvoiceStatus, number>();
  let outstanding = 0;
  let awaitingPayment = 0;

  for (const invoice of invoices) {
    countByStatus.set(
      invoice.status,
      (countByStatus.get(invoice.status) ?? 0) + 1,
    );

    // "sent" is an invoice that left the building and has not come back paid.
    // Drafts are not money owed yet, and voided ones never were.
    if (invoice.status === "sent") {
      awaitingPayment += 1;
      outstanding += Number(invoice.total);
    }
  }

  return {
    collectedToday,
    collected,
    outstanding,
    awaitingPayment,
    invoiceMix: INVOICE_STATUSES.filter((status) =>
      countByStatus.has(status),
    ).map((status) => ({
      status,
      count: countByStatus.get(status) ?? 0,
    })),
  };
}
