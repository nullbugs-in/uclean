"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { CategorySlug } from "@/data/pricing";
import { cn } from "@/lib/utils";

import {
  groupsForCategory,
  linesForGroup,
  resolveSelection,
  selectionCount,
  type ServiceSelection,
} from "../service-selection";

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
 * No prices are shown here, by design. The customer picks what needs cleaning
 * and nothing else; every figure, including the delivery charge, is assessed by
 * the team once the items are received. The price list in `src/data/pricing.ts`
 * still backs the selection behind the scenes, because the booking has to be
 * saved with a unit price for the team's own records, but none of it is
 * surfaced to the customer.
 *
 * Express is that same list priced differently, which is why switching category
 * re-prices the saved selection rather than clearing it.
 *
 * A service is picked by clicking its row. There is no tick box: a picked row
 * is filled with the brand tint and barred down its left edge, so several picks
 * read as a block of highlighted rows at a glance. There is no quantity
 * stepper either, so a selection is simply present or absent and is always one
 * unit.
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

  const visible = linesForGroup(category, activeGroup);

  /**
   * Selecting a service stores a quantity of one; tapping it again drops it.
   * The map is kept as a quantity map rather than a set so that the selection
   * shape handed to `resolveSelection` and the booking action is unchanged.
   */
  function toggle(key: string, selected: boolean) {
    const next = { ...selection };
    if (selected) {
      delete next[key];
    } else {
      next[key] = 1;
    }
    onSelectionChange(next);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Choose your services</h2>
        <p className="text-muted-foreground text-sm">
          Pick what needs cleaning, set how many, then continue to your slot.
        </p>
      </div>

      <div className="flex justify-center">
        <CategoryToggle category={category} onChange={onCategoryChange} />
      </div>

      <div className="space-y-3">
        <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
          Service category
        </p>
        <div className="flex flex-wrap gap-2">
          {groups.map((group) => {
            const active = group.slug === activeGroup;
            const count = groupCounts(category, selection)[group.slug] ?? 0;

            return (
              <button
                key={group.slug}
                type="button"
                aria-pressed={active}
                onClick={() => setActiveGroup(group.slug)}
                className={
                  active
                    ? "inline-flex items-center gap-2 rounded-full bg-[var(--primary)] px-3.5 py-1.5 text-sm font-medium text-[var(--primary-foreground)]"
                    : "border-border text-muted-foreground hover:bg-accent inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors"
                }
              >
                {group.name}
                {count > 0 ? (
                  <span
                    className={
                      active
                        ? "bg-background/30 rounded-full px-1.5 text-xs"
                        : "rounded-full bg-[var(--primary)]/15 px-1.5 text-xs text-[var(--primary-foreground)]"
                    }
                  >
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <ul className="divide-border divide-y rounded-xl border border-[var(--border)]">
        {visible.map((line) => {
          const qty = selection[line.key] ?? 0;
          const selected = qty > 0;

          return (
            <li
              key={line.key}
              className={cn(
                "-ml-px border-l-[3px] px-3 transition-colors sm:px-4",
                selected
                  ? "border-l-[var(--primary)] bg-[var(--primary)]/12"
                  : "border-l-transparent",
              )}
            >
              <div className="py-3 sm:py-4">
                {/*
                 * The row is the selection control: there is no tick box.
                 *
                 * The whole row is a button now that the quantity stepper is
                 * gone, so name and option sit inside it and a picked row is
                 * filled with the brand tint and barred down its left edge. The
                 * selected state is announced through `aria-pressed`.
                 */}
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggle(line.key, selected)}
                  className={cn(
                    "block w-full rounded-md text-left",
                    "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
                  )}
                >
                  <span
                    className={cn(
                      "block font-medium",
                      selected && "text-[var(--primary-foreground)]",
                    )}
                  >
                    {line.item}
                  </span>
                  {line.optionLabel ? (
                    <span className="text-muted-foreground block text-xs">
                      {line.optionLabel}
                    </span>
                  ) : null}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="border-border bg-muted/30 rounded-xl border p-4">
        <p className="text-sm">
          {itemCount === 0
            ? "No services selected yet"
            : `${itemCount} service${itemCount === 1 ? "" : "s"} selected`}
        </p>
        <p className="text-muted-foreground mt-1.5 text-xs">
          Pricing is assessed by our team once we receive and inspect your items.
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

/**
 * Regular and Express, as a capsule pill.
 *
 * Deliberately labels only, and now that no prices are shown anywhere in the
 * wizard it has to stay that way: the two options differ by a multiple on every
 * line rather than by a fixed price, so any "from Rs X" figure would be the
 * price of one unrelated item and would quietly mislead about the one being
 * chosen. The control only has to name the choice.
 *
 * Sized to its content rather than the card, and centred, so it reads as a
 * compact control over the list instead of a full-width bar competing with it.
 *
 * The active pill is a solid fill rather than a gradient. A lime sweep faded
 * out towards `--accent` washed the far half of the pill out to near-white,
 * which made the selected option look weaker than the unselected one sitting
 * next to it.
 */
function CategoryToggle({
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
        "ring-border inline-flex w-auto rounded-full p-1 ring-1 ring-inset sm:w-64",
        "bg-muted",
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

/** How many selected lines each group holds, for the chips. */
function groupCounts(category: CategorySlug, selection: ServiceSelection) {
  const counts: Record<string, number> = {};

  for (const group of groupsForCategory(category)) {
    counts[group.slug] = linesForGroup(category, group.slug).reduce(
      (total, line) => total + (selection[line.key] ?? 0),
      0,
    );
  }

  return counts;
}
