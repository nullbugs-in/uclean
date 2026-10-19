import { IndianRupee, Receipt, TrendingUp } from "lucide-react";

import { StatCard } from "@/components/panel/stat-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PaymentMode } from "@/db/types";
import type { SalesReport } from "@/db/queries/admin-sales";
import { formatINR } from "@/lib/utils";

const MODE_LABEL: Record<PaymentMode | "unknown", string> = {
  cod: "Cash on delivery",
  upi: "UPI",
  card: "Card",
  netbanking: "Net banking",
  wallet: "Wallet",
  unknown: "Not recorded",
};

/**
 * The sales report (section 8.9): "Sales by service, payment mode and agent,
 * with CSV export".
 *
 * Every table here is a partition of the one headline figure, which is the whole
 * design: an admin reading a breakdown that does not add back up to the number
 * at the top stops trusting the page, and then stops using it. So the revenue
 * comes from the invoice totals alone and the columns are cut from the same set.
 *
 * The by-service table is the one that earns its keep. A laundry is not one
 * product, and "we took ₹40,000" tells a store nothing about whether to keep
 * pushing dry cleaning or to drop it; the same total split by service does.
 */
export function SalesReportView({ report }: { report: SalesReport }) {
  const { totals } = report;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Collected"
          value={formatINR(totals.revenue)}
          hint="Paid invoices in this window"
          icon={IndianRupee}
        />
        <StatCard
          label="Invoices"
          value={totals.invoices}
          hint="Settled bookings"
          icon={Receipt}
        />
        <StatCard
          label="Average"
          value={formatINR(totals.average)}
          hint="Per settled booking"
          icon={TrendingUp}
        />
      </div>

      <BreakdownTable
        title="By service"
        description="What was actually billed, read from the invoice lines rather than the booking."
        columns={["Service", "Quantity", "Revenue"]}
        rows={report.byService.map((row) => [
          row.itemName,
          String(row.qty),
          formatINR(row.revenue),
        ])}
        numericFrom={1}
        empty="No service has been billed in this window."
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <BreakdownTable
          title="By payment mode"
          description="How the money came in. Revenue is split by what settled each invoice."
          columns={["Mode", "Invoices", "Revenue"]}
          rows={report.byMode.map((row) => [
            MODE_LABEL[row.mode],
            String(row.count),
            formatINR(row.revenue),
          ])}
          numericFrom={1}
          empty="No invoice has been settled in this window."
        />

        <BreakdownTable
          title="By delivery agent"
          description="What each agent carried back, keyed on the delivery leg."
          columns={["Agent", "Orders", "Revenue"]}
          rows={report.byAgent.map((row) => [
            row.fullName,
            String(row.orders),
            formatINR(row.revenue),
          ])}
          numericFrom={1}
          empty="Nothing has been delivered in this window."
        />
      </div>
    </div>
  );
}

/**
 * One breakdown, as a table rather than a chart.
 *
 * Three columns of two-digit rows are read faster as a table than as a bar
 * chart, and the chart would have to be built by hand to match the panel —
 * money and counts want tabular figures and a right edge that lines up.
 */
function BreakdownTable({
  title,
  description,
  columns,
  rows,
  numericFrom,
  empty,
}: {
  title: string;
  description: string;
  columns: string[];
  rows: string[][];
  /** First column that should be right-aligned and tabular. */
  numericFrom: number;
  empty: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">{empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left text-xs">
                  {columns.map((column, index) => (
                    <th
                      key={column}
                      className={
                        index >= numericFrom
                          ? "pb-2 pr-3 text-right font-medium last:pr-0"
                          : "pb-2 font-medium"
                      }
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr
                    key={`${row[0]}-${rowIndex}`}
                    className="border-border/60 border-b last:border-0"
                  >
                    {row.map((cell, cellIndex) => (
                      <td
                        key={cellIndex}
                        className={
                          cellIndex >= numericFrom
                            ? "py-2 pr-3 text-right tabular-nums last:pr-0"
                            : "py-2"
                        }
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
