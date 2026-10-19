"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

export type SlotLoadDay = {
  date: string;
  pickups: number;
  deliveries: number;
};

const chartConfig = {
  pickups: { label: "Pickups", color: "var(--chart-1)" },
  deliveries: { label: "Deliveries", color: "var(--chart-2)" },
} satisfies ChartConfig;

/** "Wed" for a local YYYY-MM-DD. Days are fixed at seven, so one label suffices. */
function tickLabel(dateKey: string) {
  return new Intl.DateTimeFormat("en-IN", { weekday: "short" }).format(
    new Date(`${dateKey}T00:00:00`),
  );
}

/**
 * Booked load across the window, stacked so the bar height is the day's total
 * work.
 *
 * Load rather than value: staff are not shown money. Empty days stay in the
 * data as zero-height bars instead of being dropped, because the shape of the
 * quiet days is exactly what makes the busy ones visible.
 */
export function SlotLoadChart({ days }: { days: SlotLoadDay[] }) {
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
          allowDecimals={false}
          width={32}
          tickMargin={4}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="pickups" stackId="load" fill="var(--color-pickups)" />
        <Bar
          dataKey="deliveries"
          stackId="load"
          fill="var(--color-deliveries)"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ChartContainer>
  );
}
