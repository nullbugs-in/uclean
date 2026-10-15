"use client";

import { Cell, Pie, PieChart } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { INTERNAL_STATUS_LABEL, type OrderStatus } from "@/lib/order-status";

/**
 * Colour slots are cycled across the active statuses. Five chart tokens is
 * enough because an agent rarely sees more than a handful of states at once;
 * the swatch list below the donut carries the mapping either way.
 */
const chartConfig = {
  s0: { color: "var(--chart-1)" },
  s1: { color: "var(--chart-2)" },
  s2: { color: "var(--chart-3)" },
  s3: { color: "var(--chart-4)" },
  s4: { color: "var(--chart-5)" },
} satisfies ChartConfig;

function colorFor(key: string): string {
  return chartConfig[key as keyof typeof chartConfig]?.color ?? "var(--chart-1)";
}

/**
 * Active orders by state - how much of the book is waiting where.
 *
 * Deliberately built from `status` rather than from invoice amounts: this is
 * the staff panel, where the question is "what is stuck", never "what is it
 * worth". The count in the middle is the whole picture; the list beneath it
 * keeps the chart readable without hunting for a tooltip.
 */
export function StatusMixChart({
  rows,
}: {
  rows: Array<{ status: OrderStatus; count: number }>;
}) {
  const data = rows.map((row, index) => ({
    key: `s${index % 5}`,
    label: INTERNAL_STATUS_LABEL[row.status],
    count: row.count,
  }));

  const total = data.reduce((sum, row) => sum + row.count, 0);

  return (
    <div className="space-y-4">
      <div className="relative mx-auto h-[200px] w-full max-w-[260px]">
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-full w-full"
        >
          <PieChart accessibilityLayer>
            <ChartTooltip content={<ChartTooltipContent nameKey="label" />} />
            <Pie
              data={data}
              dataKey="count"
              nameKey="label"
              innerRadius={58}
              outerRadius={88}
              paddingAngle={2}
              stroke="none"
            >
              {data.map((row) => (
                <Cell key={row.label} fill={`var(--color-${row.key})`} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-foreground text-2xl leading-none font-semibold tabular-nums">
            {total}
          </span>
          <span className="text-muted-foreground mt-1.5 text-xs">active</span>
        </div>
      </div>

      <ul className="space-y-1.5">
        {data.map((row) => (
          <li key={row.label} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: colorFor(row.key) }}
            />
            <span className="truncate">{row.label}</span>
            <span className="text-muted-foreground ml-auto tabular-nums">
              {row.count}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
