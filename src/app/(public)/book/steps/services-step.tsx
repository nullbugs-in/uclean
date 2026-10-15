"use client";

import { useState } from "react";
import { Check, Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { CategorySlug } from "@/data/pricing";
import { formatPrice } from "@/lib/utils";

import {
  groupsForCategory,
  linesForGroup,
  resolveSelection,
  selectionCount,
  selectionTotal,
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
 * Prices come from `src/data/pricing.ts`, the same list the pricing pages use,
 * so there is nothing to fetch. Express is that file's derived list at twice the
 * regular price, which is why switching category re-prices the selection rather
 * than clearing it.
 *
 * The total shown here is indicative: the final bill is assessed at pickup.
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
  const total = selectionTotal(lines);
  const itemCount = selectionCount(lines);

  const visible = linesForGroup(category, activeGroup);

  function setQty(key: string, qty: number) {
    const next = { ...selection };
    if (qty < 1) {
      delete next[key];
    } else {
      next[key] = Math.min(99, qty);
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

      <CategoryToggle
        category={category}
        onChange={onCategoryChange}
        counts={groupCounts(category, selection)}
      />

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
            <li key={line.key} className="p-3 sm:p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <label className="flex min-w-0 flex-1 items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selected}
                    onChange={(event) =>
                      setQty(line.key, event.target.checked ? 1 : 0)
                    }
                  />
                  <span className="min-w-0">
                    <span className="block font-medium">{line.item}</span>
                    {line.optionLabel ? (
                      <span className="text-muted-foreground block text-xs">
                        {line.optionLabel}
                      </span>
                    ) : null}
                  </span>
                </label>

                <span className="text-right whitespace-nowrap">
                  {line.original > line.price ? (
                    <span className="text-muted-foreground mr-2 text-sm line-through">
                      {formatPrice(line.original)}
                    </span>
                  ) : null}
                  <span className="font-display text-lg font-bold">
                    {formatPrice(line.price)}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {" "}
                    / {line.unit}
                  </span>
                </span>
              </div>

              {selected ? (
                <div className="mt-3 flex items-center gap-3 pl-7">
                  <QuantityStepper
                    qty={qty}
                    label={`Quantity for ${line.item}${
                      line.optionLabel ? ` (${line.optionLabel})` : ""
                    }`}
                    onChange={(next) => setQty(line.key, next)}
                  />
                  <span className="text-muted-foreground text-sm">
                    {formatPrice(line.price * qty)}
                  </span>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="space-y-4 rounded-xl border border-[var(--border)] p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm">
            {itemCount === 0
              ? "No services selected yet"
              : `${itemCount} item${itemCount === 1 ? "" : "s"} selected`}
          </span>
          <span className="font-display text-xl font-bold">
            {formatPrice(total)}
          </span>
        </div>
        <p className="text-muted-foreground text-xs">
          Indicative total. The final price is confirmed once we receive and
          assess your items.
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
          <Check aria-hidden="true" />
          Continue to slots
        </Button>
      </div>
    </div>
  );
}

/** Regular and Express, with Express priced at the derived multiple. */
function CategoryToggle({
  category,
  onChange,
  counts,
}: {
  category: CategorySlug;
  onChange: (category: CategorySlug) => void;
  counts: Record<string, number>;
}) {
  return (
    <div
      role="group"
      aria-label="Service speed"
      className="bg-muted/60 flex gap-1 rounded-xl p-1"
    >
      {(["regular", "express"] as const).map((value) => {
        const active = category === value;
        const picked = Object.keys(counts).length;

        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(value)}
            className={
              active
                ? "bg-background text-foreground flex-1 rounded-lg px-3 py-2 text-sm font-medium shadow-sm transition-colors"
                : "text-muted-foreground hover:text-foreground flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
            }
          >
            {value === "regular" ? "Regular" : "Express"}
            {active && picked > 0 ? (
              <span className="text-muted-foreground ml-1.5 text-xs">
                {picked} kept
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function QuantityStepper({
  qty,
  label,
  onChange,
}: {
  qty: number;
  label: string;
  onChange: (qty: number) => void;
}) {
  return (
    <div className="border-border inline-flex items-center rounded-full border">
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        disabled={qty <= 1}
        onClick={() => onChange(qty - 1)}
        className="hover:bg-accent grid size-8 place-items-center rounded-full transition-colors disabled:opacity-40"
      >
        <Minus className="size-3.5" aria-hidden="true" />
      </button>
      <span className="w-8 text-center text-sm font-medium" aria-live="polite">
        {qty}
      </span>
      <button
        type="button"
        aria-label={`Increase ${label}`}
        disabled={qty >= 99}
        onClick={() => onChange(qty + 1)}
        className="hover:bg-accent grid size-8 place-items-center rounded-full transition-colors disabled:opacity-40"
      >
        <Plus className="size-3.5" aria-hidden="true" />
      </button>
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
