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
    <div className="mt-8 space-y-6 sm:mt-10 sm:space-y-8">
      <div className="flex justify-center">
        <SpeedToggle category={speed} onChange={setSpeed} />
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 lg:gap-5">
        {category.groups.map((group) => {
          const Icon = GROUP_ICONS[group.slug] ?? Sparkles;
          const cheapest = cheapestInGroup(group);

          return (
            <li key={group.slug}>
              <Link
                href={`/pricing?speed=${category.slug}&group=${group.slug}`}
                className="group focus-visible:ring-ring relative flex h-full flex-col gap-3 overflow-hidden rounded-2xl border border-[color-mix(in_oklab,var(--primary),transparent_72%)] bg-gradient-to-br from-[var(--accent)]/70 via-[var(--card)] to-[var(--card)] p-4 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-[var(--primary)] hover:shadow-[0_16px_40px_-20px_var(--primary)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none sm:gap-4 sm:p-5"
              >
                {/* Brand glow that blooms in from the corner on hover. */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -top-10 -right-10 size-32 rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--primary),transparent_70%),transparent)] opacity-0 blur-2xl transition-opacity duration-200 group-hover:opacity-100"
                />

                <div className="relative flex items-start justify-between gap-3">
                  <span
                    aria-hidden="true"
                    className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[var(--primary)] to-[color-mix(in_oklab,var(--primary),var(--primary-foreground)_20%)] text-[var(--primary-foreground)] shadow-[0_6px_18px_-8px_var(--primary)] transition-transform duration-200 group-hover:scale-105 sm:size-10"
                  >
                    <Icon className="size-4 sm:size-5" />
                  </span>
                  <ArrowRight
                    aria-hidden="true"
                    className="text-muted-foreground group-hover:text-foreground size-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
                  />
                </div>

                <div className="relative flex-1">
                  <p className="font-display text-lg font-bold tracking-tight">
                    {group.name}
                  </p>
                  <span
                    aria-hidden="true"
                    className="mt-1.5 block h-0.5 w-8 rounded-full bg-gradient-to-r from-[var(--primary)] to-[var(--accent)] transition-all duration-200 group-hover:w-14 sm:mt-2"
                  />
                  <p className="text-muted-foreground mt-1.5 text-sm sm:mt-2">
                    {group.items.length} items
                    {group.turnaround ? ` · ready in ${group.turnaround}` : ""}
                  </p>
                </div>

                {cheapest ? (
                  <p className="text-foreground relative inline-flex w-fit flex-wrap items-baseline gap-x-2 self-start rounded-full bg-[var(--primary)]/15 px-2.5 py-1">
                    <span className="text-muted-foreground text-xs">from</span>
                    <span className="font-display text-lg font-bold sm:text-xl">
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
