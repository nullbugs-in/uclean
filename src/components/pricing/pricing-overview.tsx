"use client";

import Link from "next/link";
import {
  ArrowRight,
  Baby,
  Blinds,
  Footprints,
  Shirt,
  Sofa,
  Sparkles,
  WashingMachine,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

import {
  pricingCategories,
  type CategorySlug,
  type PriceGroup,
  type PriceOption,
} from "@/data/pricing";
import { formatPrice } from "@/lib/utils";

import { SpeedToggle } from "./speed-toggle";

/** One icon per service category, keyed by the group slug in the price data. */
const GROUP_ICONS: Record<string, LucideIcon> = {
  "laundry-services": WashingMachine,
  "adult-wear": Shirt,
  "kids-wear": Baby,
  "shoe-cleaning": Footprints,
  household: Sofa,
  "curtain-cleaning": Blinds,
};

/** Cheapest single price in a group, for the "from" figure on its card. */
function cheapestInGroup(group: PriceGroup) {
  let cheapest: PriceOption | undefined;

  for (const item of group.items) {
    for (const option of item.options) {
      if (!cheapest || option.price < cheapest.price) cheapest = option;
    }
  }

  return cheapest ? { price: cheapest.price, unit: cheapest.unit } : undefined;
}

/**
 * The home page's pricing overview.
 *
 * The Regular/Express toggle and the six service categories, matching the
 * pricing page's own controls, but each category is a link out rather than a
 * filter: tapping one deep-links to /pricing with that speed and category
 * seeded, so the visitor lands on the full price list for what they picked.
 *
 * The figures shown here come from the same `src/data/pricing.ts` the pricing
 * page reads, so they can never disagree.
 */
export function PricingOverview() {
  const [speed, setSpeed] = useState<CategorySlug>("regular");

  const category =
    pricingCategories.find((entry) => entry.slug === speed) ??
    pricingCategories[0];

  if (!category) return null;

  return (
    <div className="mt-10 space-y-8">
      <div className="flex justify-center">
        <SpeedToggle category={speed} onChange={setSpeed} />
      </div>

      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {category.groups.map((group) => {
          const Icon = GROUP_ICONS[group.slug] ?? Sparkles;
          const cheapest = cheapestInGroup(group);

          return (
            <li key={group.slug}>
              <Link
                href={`/pricing?speed=${category.slug}&group=${group.slug}`}
                className="group border-border bg-card focus-visible:ring-ring flex h-full flex-col gap-4 rounded-2xl border p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[var(--primary)] hover:shadow-md focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                <div className="flex items-start justify-between gap-3">
                  <span
                    aria-hidden="true"
                    className="bg-primary/15 text-primary grid size-10 shrink-0 place-items-center rounded-xl"
                  >
                    <Icon className="size-5" />
                  </span>
                  <ArrowRight
                    aria-hidden="true"
                    className="text-muted-foreground group-hover:text-foreground size-4 shrink-0 transition-colors"
                  />
                </div>

                <div className="flex-1">
                  <p className="font-display text-lg font-bold tracking-tight">
                    {group.name}
                  </p>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {group.items.length} items
                    {group.turnaround ? ` · ready in ${group.turnaround}` : ""}
                  </p>
                </div>

                {cheapest ? (
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-muted-foreground text-xs">from</span>
                    <span className="font-display text-xl font-bold">
                      {formatPrice(cheapest.price)}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      / {cheapest.unit}
                    </span>
                  </p>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>

      <p className="text-muted-foreground text-center text-sm">
        Showing {category.name} prices. Pick a category for every line.
      </p>
    </div>
  );
}
