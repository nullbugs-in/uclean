"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatINR } from "@/lib/utils";

export type RevenuePoint = { date: string; amount: number };

const chartConfig = {
  amount: { label: "Collected", color: "var(--chart-1)" },
} satisfies ChartConfig;

/** "Wed" for a local YYYY-MM-DD. */
function tickLabel(dateKey: string) {
  return new Intl.DateTimeFormat("en-IN", { weekday: "short" }).format(
    new Date(`${dateKey}T00:00:00`),
  );
}

/**
 * Rupees, shortened for an axis tick. The tooltip spells the amount out in
 * full, so the axis only has to be scannable.
 */
function formatAxis(value: number): string {
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(0)}k`;
  return `₹${value}`;
}

/**
 * Cash collected per day.
 *
 * Bars rather than a line because each day is a discrete take, not a
 * continuous reading, and because a day that collected nothing should be
 * visibly a gap rather than a smooth dip. The days with no takings are kept in
 * the series for exactly that reason.
 */
export function RevenueChart({ days }: { days: RevenuePoint[] }) {
  const data = days.map((day) => ({ ...day, label: tickLabel(day.date) }));

  return (
    <ChartContainer
      config={chartConfig}
      className="aspect-auto h-[240px] w-full"
    >
      <BarChart
        accessibilityLayer
        data={data}
        margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
      >
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          interval="preserveStartEnd"
          minTickGap={8}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={52}
          tickMargin={4}
          tickFormatter={formatAxis}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) => formatINR(Number(value))}
            />
          }
        />
        <Bar
          dataKey="amount"
          fill="var(--color-amount)"
          radius={[4, 4, 0, 0]}
          maxBarSize={48}
        />
      </BarChart>
    </ChartContainer>
  );
}
