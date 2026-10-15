import type { Metadata } from "next";
import Link from "next/link";
import {
  ClipboardList,
  IndianRupee,
  PackageCheck,
  Receipt,
  TriangleAlert,
  Truck,
} from "lucide-react";

import { DonutChart } from "@/components/panel/donut-chart";
import { PanelPage } from "@/components/panel/panel-page";
import { StatCard } from "@/components/panel/stat-card";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getRevenueOverview } from "@/db/queries/admin";
import { getStoreSettings, listTimeSlots } from "@/db/queries/catalog";
import { getAdminOrderCounts } from "@/db/queries/orders";
import { createClient } from "@/db/server";
import type { InvoiceStatus } from "@/db/types";
import { toDateKey } from "@/lib/dates";
import { formatINR } from "@/lib/utils";

import { RevenueChart } from "../_components/revenue-chart";

export const metadata: Metadata = { title: "Admin dashboard" };

const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent, unpaid",
  paid: "Paid",
  void: "Void",
};

/** Two weeks, so a slow week still has a busy one beside it to compare with. */
const REVENUE_DAYS = 14;

/**
 * Admin dashboard (section 8.1).
 *
 * Two halves that answer different questions. The money half counts only
 * payments that actually settled, next to the invoices still waiting, so the
 * two figures can be read against each other. The operations half is the same
 * load the staff panel works from, which is what makes the numbers here and
 * there agree.
 *
 * Slot utilisation, agent workload and repeat customers are still open, and the
 * setup checks below say so rather than quietly showing a zero.
 */
export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const today = toDateKey(new Date());

  const [counts, revenue, store, slots] = await Promise.all([
    getAdminOrderCounts(supabase, today).catch(() => null),
    getRevenueOverview(supabase, { day: today, days: REVENUE_DAYS }).catch(
      () => null,
    ),
    getStoreSettings(supabase).catch(() => null),
    listTimeSlots(supabase).catch(() => null),
  ]);

  const invoicesRaised =
    revenue?.invoiceMix.reduce((total, row) => total + row.count, 0) ?? 0;

  return (
    <PanelPage
      title="Dashboard"
      description={`Today at a glance, with the last ${REVENUE_DAYS} days of takings.`}
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Collected today"
          value={revenue ? formatINR(revenue.collectedToday) : "-"}
          hint="Settled payments only"
          icon={IndianRupee}
        />
        <StatCard
          label="Outstanding"
          value={revenue ? formatINR(revenue.outstanding) : "-"}
          hint={
            revenue
              ? `${revenue.awaitingPayment} invoice${
                  revenue.awaitingPayment === 1 ? "" : "s"
                } sent, unpaid`
              : "Bills sent but not settled"
          }
          icon={TriangleAlert}
        />
        <StatCard
          label="Orders today"
          value={counts?.ordersToday ?? "-"}
          hint="Booked for today"
          icon={ClipboardList}
        />
        <StatCard
          label="Pending pickups"
          value={counts?.pendingPickups ?? "-"}
          hint="Waiting on an agent"
          icon={PackageCheck}
        />
        <StatCard
          label="Delivered today"
          value={counts?.deliveredToday ?? "-"}
          hint="Round closed"
          icon={Truck}
        />
        <StatCard
          label="Invoices raised"
          value={revenue ? invoicesRaised : "-"}
          hint="Every invoice on record"
          icon={Receipt}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Takings</CardTitle>
            <CardDescription>
              Collected per day over the last {REVENUE_DAYS} days. Quiet days
              stay in the chart, because the gaps are the story.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {revenue ? (
              <RevenueChart days={revenue.collected} />
            ) : (
              <p className="text-muted-foreground py-8 text-center text-sm">
                Takings are unavailable right now.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Invoice states</CardTitle>
            <CardDescription>Where every invoice stands.</CardDescription>
          </CardHeader>
          <CardContent>
            <DonutChart
              rows={(revenue?.invoiceMix ?? []).map((row) => ({
                label: INVOICE_STATUS_LABEL[row.status],
                value: row.count,
              }))}
              centerLabel="invoices"
              emptyLabel="No invoices raised yet."
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Setup checks</CardTitle>
          <CardDescription>
            Two settings the app will not guess for you.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <SetupCheck
            ok={store !== null && store.lat !== null && store.lng !== null}
            label="Store coordinates set"
            hint="Pickup booking refuses to run until these are set in Settings."
          />
          <SetupCheck
            ok={
              slots !== null &&
              slots.length > 0 &&
              slots.every((slot) => slot.capacity > 0)
            }
            label="Slot capacity configured"
            hint="A capacity of 0 reads as a full slot. Set one per slot in Time slots."
          />
          <p className="text-muted-foreground text-xs">
            Both are open questions in the source design, so neither is guessed.{" "}
            <Link
              href="/admin/settings"
              className="text-primary font-medium underline-offset-4 hover:underline"
            >
              Open settings
            </Link>
          </p>
        </CardContent>
      </Card>
    </PanelPage>
  );
}

function SetupCheck({
  ok,
  label,
  hint,
}: {
  ok: boolean;
  label: string;
  hint: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Badge variant={ok ? "success" : "warning"} className="mt-0.5 shrink-0">
        {ok ? "Set" : "To do"}
      </Badge>
      <div className="space-y-0.5">
        <p className="font-medium">{label}</p>
        <p className="text-muted-foreground text-xs">{hint}</p>
      </div>
    </div>
  );
}
