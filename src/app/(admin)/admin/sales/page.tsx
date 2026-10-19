import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";

import { PanelPage } from "@/components/panel/panel-page";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  PERIODS,
  PERIOD_LABEL,
  buildSales,
  type SalesPeriodId,
} from "@/db/queries/admin-sales";
import { createClient } from "@/db/server";
import { toDateKey } from "@/lib/dates";
import { requireAdmin } from "@/server/auth";
import { cn } from "@/lib/utils";

import { SalesReportView } from "../../_components/sales-report";

export const metadata: Metadata = { title: "Sales reports" };

function readPeriod(value: string | string[] | undefined): SalesPeriodId {
  const candidate = Array.isArray(value) ? value[0] : value;

  return (PERIODS as readonly string[]).includes(candidate ?? "")
    ? (candidate as SalesPeriodId)
    : "all";
}

/**
 * Sales reports (section 8.9): "Daily, weekly and monthly sales by service,
 * payment mode and agent, with CSV export".
 *
 * The report is built from invoices that were **paid** in the window, not from
 * bookings and not from payments. A booking is not money until it is invoiced,
 * and summing `payments` alongside the invoice totals would count an invoice
 * twice whenever it was settled in more than one payment - which is a number an
 * admin cannot act on. So one figure is used everywhere and the breakdowns cut
 * that same figure up.
 *
 * GST treatment and invoice numbering are still open questions in the source
 * design. The invoices table already carries a GSTIN on `store_settings` and a
 * GST-safe invoice number, so the two belong in Settings before the first real
 * invoice goes out.
 */
export default async function AdminSalesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string | string[] }>;
}) {
  await requireAdmin();

  const { period } = await searchParams;
  const periodId = readPeriod(period);

  const supabase = await createClient();

  const report = await buildSales(
    supabase,
    periodId,
    toDateKey(new Date()),
  ).catch((error: unknown) => {
    console.error("Could not build the sales report", error);
    return null;
  });

  return (
    <PanelPage
      title="Sales reports"
      description="Sales by service, payment mode and delivery agent, with CSV export."
      action={
        <Button asChild variant="outline">
          <Link href={`/admin/sales/export?period=${periodId}`}>
            <Download aria-hidden />
            Export CSV
          </Link>
        </Button>
      }
    >
      <div className="space-y-6">
        <nav
          aria-label="Choose a period"
          className="flex flex-wrap items-center gap-2"
        >
          {PERIODS.map((id) => {
            const active = id === periodId;

            return (
              <Link
                key={id}
                href={id === "all" ? "/admin/sales" : `?period=${id}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground font-medium"
                    : "border-border hover:bg-accent hover:text-accent-foreground",
                )}
              >
                {PERIOD_LABEL[id]}
              </Link>
            );
          })}
        </nav>

        {report === null ? (
          <div className="border-border rounded-xl border border-dashed px-6 py-12 text-center">
            <p className="font-medium">The report could not be built.</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Please try again shortly.
            </p>
          </div>
        ) : (
          <SalesReportView report={report} />
        )}

        {/* Kept from the placeholder this page replaces: a real configuration
            step, and the only place it is visible outside the invoices table. */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Before the first invoice</CardTitle>
            <CardDescription>
              GST treatment and invoice numbering are still open questions in the
              source design.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              The invoices table already carries a GSTIN on{" "}
              <code className="font-mono text-xs">store_settings</code> and a
              GST-safe invoice number, so set them in Settings before the first
              real invoice goes out.
            </p>
          </CardContent>
        </Card>
      </div>
    </PanelPage>
  );
}
