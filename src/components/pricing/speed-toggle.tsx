"use client";

import type { CategorySlug } from "@/lib/pricing";
import { cn } from "@/lib/utils";

/**
 * Regular and Express, as a capsule pill.
 *
 * Matches the control in the booking wizard so the two surfaces read as one
 * product: sized to its content and centred, with a solid fill for the active
 * option rather than a gradient that would wash the selected half out.
 *
 * Shared by the pricing page and the home overview so the two cannot drift.
 */
export function SpeedToggle({
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
