"use client";

import { useState } from "react";

import { pricingCategories, type CategorySlug } from "@/data/pricing";
import { cn, formatPrice } from "@/lib/utils";

/**
 * The pricing view as an interactive browser.
 *
 * Same shape as the service step in the booking wizard - a Regular/Express
 * capsule toggle over a row of sub-category capsules that filter the list below
 * - except this one is the price list, so every line shows its figures. The
 * book step stays price-free on purpose; here the prices are the point.
 *
 * Both the speed and the sub-category are local state. The URL does not change,
 * so the page stays a single crawlable /pricing entry, and the per-category
 * pages at /pricing/[category] are left in place.
 */
export function PricingBrowser() {
  const [category, setCategory] = useState<CategorySlug>("regular");
  const [activeGroup, setActiveGroup] = useState(
    () => pricingCategories[0]?.groups[0]?.slug ?? "",
  );

  const activeCategory =
    pricingCategories.find((entry) => entry.slug === category) ??
    pricingCategories[0];
  const groups = activeCategory?.groups ?? [];
  const group = groups.find((entry) => entry.slug === activeGroup) ?? groups[0];

  if (!activeCategory || !group) return null;

  return (
    <div className="space-y-6">
      <div className="flex justify-center">
        <SpeedToggle category={category} onChange={setCategory} />
      </div>

      <div className="space-y-3">
        <p className="text-muted-foreground text-center text-xs font-semibold tracking-wider uppercase">
          Service category
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {groups.map((entry) => {
            const active = entry.slug === group.slug;

            return (
              <button
                key={entry.slug}
                type="button"
                aria-pressed={active}
                onClick={() => setActiveGroup(entry.slug)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                    : "border-border text-muted-foreground hover:bg-accent border",
                )}
              >
                {entry.name}
              </button>
            );
          })}
        </div>
      </div>

      {/*
        Express is derived from the Regular list rather than quoted separately,
        so say so instead of implying the figures were set independently.
      */}
      {activeCategory.derived ? (
        <p className="border-border bg-muted/40 rounded-lg border p-3 text-sm">
          These prices are {activeCategory.derivedFrom}, with a{" "}
          {activeCategory.turnaround} turnaround.
        </p>
      ) : null}

      <div className="mx-auto max-w-2xl space-y-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="font-display text-xl font-bold tracking-tight">
            {group.name}
          </h2>
          <p className="text-muted-foreground text-sm">
            {group.items.length} items
            {group.turnaround ? ` · ready in ${group.turnaround}` : ""}
          </p>
        </div>

        {/*
          One row per item, dressed as a table: a brand-tinted header row names
          the two columns and each row aligns to them from `sm`, stacking on
          phones where the columns would not fit. Items with a single price
          (Shoe Cleaning, Household) show it bare; items with two (Dry Cleaning
          and Steam Ironing) break out one labelled line each, so the two are
          never confused for each other.
        */}
        <div className="border-border overflow-hidden rounded-2xl border shadow-sm">
          <div className="hidden grid-cols-[1fr_auto] gap-4 bg-[var(--primary)]/15 px-4 py-2.5 text-xs font-semibold tracking-wider uppercase sm:grid">
            <span>Service</span>
            <span className="text-right">Price</span>
          </div>

          <ul>
            {group.items.map((item, itemIndex) => (
              <li
                key={item.slug}
                className="relative border-l-2 border-transparent px-4 py-3 transition-colors hover:border-[var(--primary)] hover:bg-[var(--accent)]/40 sm:py-4"
              >
                {/*
                  Brand-colour breaker between rows: two hairline gradients
                  fading toward the edges with a small lime node at the centre,
                  so the seam reads as a themed flourish rather than a hard
                  table grid line. The last row has none, and because it lives
                  inside the row the hover tint paints under it.
                */}
                {itemIndex < group.items.length - 1 ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-4 bottom-0 flex items-center gap-2"
                  >
                    <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[var(--primary)]/70" />
                    <span className="size-1.5 rounded-full bg-[var(--primary)] shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary),transparent_80%)]" />
                    <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[var(--primary)]/70" />
                  </span>
                ) : null}

                <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 sm:grid sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="min-w-0">
                    <p className="font-medium">{item.name}</p>
                    {group.turnaround ? (
                      <p className="text-muted-foreground text-xs">
                        Ready in {group.turnaround}
                      </p>
                    ) : null}
                  </div>

                  <ul className="space-y-1.5 sm:text-right">
                    {item.options.map((option, index) => (
                      <li
                        key={option.label ?? `${item.slug}-${index}`}
                        className="flex flex-wrap items-center gap-x-2 gap-y-1 sm:justify-end"
                      >
                        {option.label ? (
                          <span className="border-border text-muted-foreground rounded-full border px-2 py-0.5 text-xs">
                            {option.label}
                          </span>
                        ) : null}
                        {option.original > option.price ? (
                          <span className="text-muted-foreground text-sm line-through">
                            {formatPrice(option.original)}
                          </span>
                        ) : null}
                        <span className="rounded-full bg-[var(--primary)]/15 px-2.5 py-1 whitespace-nowrap text-[var(--primary-foreground)]">
                          <span className="font-display text-base font-bold">
                            {formatPrice(option.price)}
                          </span>
                          <span className="text-xs"> / {option.unit}</span>
                        </span>
                        {option.turnaround ? (
                          <span className="text-muted-foreground w-full text-xs sm:w-auto">
                            {option.turnaround}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/**
 * Regular and Express, as a capsule pill.
 *
 * Matches the control in the booking wizard so the two surfaces read as one
 * product: sized to its content and centred, with a solid fill for the active
 * option rather than a gradient that would wash the selected half out.
 */
function SpeedToggle({
  category,
  onChange,
}: {
  category: CategorySlug;
  onChange: (category: CategorySlug) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Service speed"
      className={cn(
        "ring-border bg-muted inline-flex w-auto rounded-full p-1 ring-1 ring-inset sm:w-64",
      )}
    >
      {(["regular", "express"] as const).map((value) => {
        const active = category === value;

        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(value)}
            className={cn(
              "rounded-full px-5 py-1.5 text-sm font-semibold sm:flex-1 sm:px-4",
              "transition-all duration-200 ease-out",
              "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
              active
                ? "text-primary-foreground bg-primary shadow-[0_2px_10px] shadow-[color-mix(in_oklab,var(--primary),transparent_60%)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {value === "regular" ? "Regular" : "Express"}
          </button>
        );
      })}
    </div>
  );
}
