"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SpeedToggle } from "@/components/pricing/speed-toggle";
import type { CategorySlug } from "@/data/pricing";
import { cn } from "@/lib/utils";

import {
  groupsForCategory,
  itemsForGroup,
  resolveSelection,
  selectionCount,
  type SelectableItem,
  type ServiceSelection,
} from "../service-selection";

/**
 * The two long wear groups, capped to a self-scrolling box so they do not
 * stretch the page. The same two groups are capped on the pricing page.
 */
const SCROLLABLE_GROUPS: ReadonlySet<string> = new Set([
  "adult-wear",
  "kids-wear",
]);

type ServicesStepProps = {
  category: CategorySlug;
  selection: ServiceSelection;
  onCategoryChange: (category: CategorySlug) => void;
  onSelectionChange: (selection: ServiceSelection) => void;
  onBack: () => void;
  onContinue: () => void;
};

/**
 * Step 3: choose services.
 *
 * The list is laid out exactly as the pricing page's is - one row per service,
 * grouped under the same category capsules behind the same Regular/Express
 * toggle - so the two read as one product. The one deliberate difference is
 * that no money appears here: the customer picks what needs cleaning and
 * nothing else, and every figure is assessed by the team once the items are
 * received. The price list in `src/data/pricing.ts` still backs the selection
 * behind the scenes, because the booking has to be saved with a unit price for
 * the team's own records, but none of it is surfaced to the customer.
 *
 * Express is that same list priced differently, which is why switching category
 * re-prices the saved selection rather than clearing it.
 *
 * A service is picked by clicking its row. There is no tick box, no variant
 * choice and no quantity stepper: the customer names what needs cleaning, one
 * row per service, and a picked row is filled with the brand tint and barred
 * down its left edge, so several picks read as a block of highlighted rows at a
 * glance.
 */
export function ServicesStep({
  category,
  selection,
  onCategoryChange,
  onSelectionChange,
  onBack,
  onContinue,
}: ServicesStepProps) {
  const groups = groupsForCategory(category);
  const [activeGroup, setActiveGroup] = useState(groups[0]?.slug ?? "");

  const lines = resolveSelection(selection, category);
  const itemCount = selectionCount(lines);

  const group = groups.find((entry) => entry.slug === activeGroup) ?? groups[0];
  const items = group ? itemsForGroup(category, group.slug) : [];
  const scrollable = group ? SCROLLABLE_GROUPS.has(group.slug) : false;

  /**
   * Selecting a service stores a quantity of one; tapping it again drops it.
   * The map is kept as a quantity map rather than a set so that the selection
   * shape handed to `resolveSelection` and the booking action is unchanged.
   */
  function toggle(item: SelectableItem, selected: boolean) {
    const next = { ...selection };

    if (selected) {
      delete next[item.optionKey];
    } else {
      next[item.optionKey] = 1;
    }

    onSelectionChange(next);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Choose your services</h2>
        <p className="text-muted-foreground text-sm">
          Pick what needs cleaning, then continue to your slot.
        </p>
      </div>

      <div className="flex justify-center">
        <SpeedToggle category={category} onChange={onCategoryChange} />
      </div>

      <div className="space-y-3">
        <p className="text-muted-foreground text-center text-xs font-semibold tracking-wider uppercase">
          Service category
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {groups.map((entry) => {
            const active = entry.slug === group?.slug;
            const count = groupCounts(category, selection)[entry.slug] ?? 0;

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
                {count > 0 ? (
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-xs",
                      active
                        ? "bg-background/30"
                        : "bg-[var(--primary)]/15 text-[var(--primary-foreground)]",
                    )}
                  >
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/*
        Narrower than the wizard around it, and centred: the list is one column
        of short names with no figures beside them, so the width the price list
        needs for its second column is wasted here. Left-aligned at the smallest
        size, where long names like "Shirt / Pant / T-shirt / Kurta" still need
        the room.
      */}
      <div className="mx-auto w-full max-w-md space-y-3">
        <div className="flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1">
          <h3 className="font-display text-xl font-bold tracking-tight">
            {group?.name}
          </h3>
          <p className="text-muted-foreground text-sm">{items.length} items</p>
        </div>

        {/*
          One row per service, dressed as a table: a brand-tinted header row
          names the column and each row aligns to it. Unlike the price list
          there is no second column, because no figure is shown here.
        */}
        <div className="border-border relative overflow-hidden rounded-2xl border shadow-sm">
          <div className="bg-[var(--primary)]/15 px-4 py-2.5 text-center text-xs font-semibold tracking-wider uppercase">
            Service
          </div>

          {/*
            Capped groups get a self-scrolling box so the page keeps its
            height; the header row above stays put while rows scroll under it.
            The region is focusable so it can be scrolled from the keyboard,
            since the rows themselves are short.
          */}
          <ul
            {...(scrollable
              ? {
                  tabIndex: 0,
                  role: "region",
                  "aria-label": `${group?.name} services, scroll to see all ${items.length} items`,
                }
              : {})}
            className={cn(
              scrollable &&
                "focus-visible:outline-ring max-h-[26rem] [scrollbar-width:thin] [scrollbar-color:var(--primary)_transparent] overflow-y-auto overscroll-contain focus-visible:outline-2 focus-visible:outline-offset-[-2px]",
            )}
          >
            {items.map((item, itemIndex) => {
              const selected = (selection[item.optionKey] ?? 0) > 0;

              return (
                <li
                  key={item.key}
                  className={cn(
                    "relative border-l-2 px-4 py-3 transition-colors sm:py-4",
                    "hover:border-[var(--primary)] hover:bg-[var(--accent)]/40",
                    selectedClass(selected),
                  )}
                >
                  {/*
                    Brand-colour breaker between rows: two hairline gradients
                    fading toward the edges with a small lime node at the
                    centre, so the seam reads as a themed flourish rather than a
                    hard table grid line. The last row has none, and because it
                    lives inside the row the hover tint paints under it.
                  */}
                  {itemIndex < items.length - 1 ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-4 bottom-0 flex items-center gap-2"
                    >
                      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[var(--primary)]/70" />
                      <span className="size-1.5 rounded-full bg-[var(--primary)] shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary),transparent_80%)]" />
                      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[var(--primary)]/70" />
                    </span>
                  ) : null}

                  {/*
                    The name is the whole control, and the whole row. There is
                    no tick box, no variant chips and no quantity: the customer
                    is saying what needs cleaning, nothing more. A picked row is
                    filled with the brand tint and barred down its left edge,
                    and the state is announced through `aria-pressed`.

                    Centred at every width, to sit under the centred header and
                    group heading above it.
                  */}
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggle(item, selected)}
                    className={cn(
                      "block w-full rounded-md text-center font-medium",
                      "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
                    )}
                  >
                    {item.item}
                  </button>
                </li>
              );
            })}
          </ul>

          {/*
            Fade hint: a soft background-coloured scrim over the last visible
            rows, so a capped list reads as "there is more below" instead of
            looking abruptly cut off.
          */}
          {scrollable ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[var(--background)] to-transparent"
            />
          ) : null}
        </div>

        {scrollable ? (
          <p className="text-muted-foreground text-center text-xs">
            Scroll within the list to see all {items.length} items.
          </p>
        ) : null}
      </div>

      <div className="border-border bg-muted/30 rounded-xl border p-4">
        <p className="text-sm">
          {itemCount === 0
            ? "No services selected yet"
            : `${itemCount} service${itemCount === 1 ? "" : "s"} selected`}
        </p>
        <p className="text-muted-foreground mt-1.5 text-xs">
          Pricing is assessed by our team once we receive and inspect your
          items.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button
          type="button"
          onClick={onContinue}
          disabled={itemCount === 0}
          className="sm:min-w-40"
        >
          <MapPin aria-hidden="true" />
          Continue to slots
        </Button>
      </div>
    </div>
  );
}

/** The picked state: brand tint over the row, barred down its left edge. */
function selectedClass(selected: boolean) {
  return selected
    ? "border-l-[var(--primary)] bg-[var(--primary)]/12"
    : "border-l-transparent";
}

/** How many selected lines each group holds, for the chips. */
function groupCounts(category: CategorySlug, selection: ServiceSelection) {
  const counts: Record<string, number> = {};

  for (const group of groupsForCategory(category)) {
    counts[group.slug] = itemsForGroup(category, group.slug).reduce(
      (total, item) => total + (selection[item.optionKey] ?? 0),
      0,
    );
  }

  return counts;
}
