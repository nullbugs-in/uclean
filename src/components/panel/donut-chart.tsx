"use client";

import { Cell, Pie, PieChart } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

/**
 * Five colour slots, cycled across however many rows arrive. More rows than
 * slots is rare - the panels show a handful of states at a time - and the
 * swatch list beneath the donut carries the mapping either way, so a repeat
 * colour never leaves a slice unidentifiable.
 */
const chartConfig = {
  s0: { color: "var(--chart-1)" },
  s1: { color: "var(--chart-2)" },
  s2: { color: "var(--chart-3)" },
  s3: { color: "var(--chart-4)" },
  s4: { color: "var(--chart-5)" },
} satisfies ChartConfig;

/**
 * Read from the config rather than from the injected `--color-s0`, because the
 * config's colours are the global `--chart-*` tokens. The injected ones only
 * exist inside the chart container, and this swatch list sits outside it.
 */
function colorFor(key: string): string {
  return (
    chartConfig[key as keyof typeof chartConfig]?.color ?? "var(--chart-1)"
  );
}

export type DonutRow = { label: string; value: number };

/**
 * Share-of-a-total donut with the count in the middle.
 *
 * One implementation for every panel breakdown - active orders by state on the
 * staff side, invoice states on the admin side - because the only real
 * difference between them is where the labels come from. The list beneath it is
 * not decoration: a donut alone makes people guess, and the whole point of
 * these screens is that nobody has to.
 */
export function DonutChart({
  rows,
  centerLabel,
  emptyLabel,
}: {
  rows: DonutRow[];
  centerLabel: string;
  emptyLabel: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        {emptyLabel}
      </p>
    );
  }

  const data = rows.map((row, index) => ({
    ...row,
    key: `s${index % 5}`,
  }));
  const total = data.reduce((sum, row) => sum + row.value, 0);

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
              dataKey="value"
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
          <span className="text-muted-foreground mt-1.5 text-xs">
            {centerLabel}
          </span>
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
              {row.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
