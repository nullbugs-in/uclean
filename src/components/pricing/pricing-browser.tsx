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
        <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
          Service category
        </p>
        <div className="flex flex-wrap gap-2">
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

      <div className="space-y-3">
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
          One row per item. Items with a single price (Shoe Cleaning, Household)
          show it bare; items with two (Dry Cleaning and Steam Ironing) break out
          one labelled line each, so the two are never confused for each other.
        */}
        <ul className="divide-border divide-y rounded-xl border border-[var(--border)]">
          {group.items.map((item) => (
            <li
              key={item.slug}
              className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-3 py-3 sm:px-4 sm:py-4"
            >
              <div className="min-w-0">
                <p className="font-medium">{item.name}</p>
                {group.turnaround ? (
                  <p className="text-muted-foreground text-xs">
                    Ready in {group.turnaround}
                  </p>
                ) : null}
              </div>

              <ul className="space-y-1 text-right">
                {item.options.map((option, index) => (
                  <li key={option.label ?? `${item.slug}-${index}`}>
                    {option.label ? (
                      <span className="text-muted-foreground block text-xs">
                        {option.label}
                      </span>
                    ) : null}
                    {option.turnaround ? (
                      <span className="text-muted-foreground block text-xs">
                        {option.turnaround}
                      </span>
                    ) : null}
                    <span className="whitespace-nowrap">
                      {option.original > option.price ? (
                        <span className="text-muted-foreground mr-2 text-sm line-through">
                          {formatPrice(option.original)}
                        </span>
                      ) : null}
                      <span className="font-display text-lg font-bold">
                        {formatPrice(option.price)}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {" "}
                        / {option.unit}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
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
