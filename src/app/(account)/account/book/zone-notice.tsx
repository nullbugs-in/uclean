"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * Step 0 of the booking wizard: the 6 km delivery zone notice.
 *
 * Acceptance is a gate, not decoration: book_pickup rejects an order whose
 * accepted_zone_notice_at is null, and a database trigger enforces the same
 * thing on insert so no other code path can skip it.
 */
export function ZoneNotice({ maxRadiusKm }: { maxRadiusKm: number }) {
  const [accepted, setAccepted] = useState(false);

  return (
    <div className="space-y-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
      <p className="font-medium">
        Pickup is available only within {maxRadiusKm} km driving distance.
      </p>
      <p className="text-sm">
        We measure by driving distance from the store, not straight line. If
        your address is outside this range we will let you know before you pick
        a slot.
      </p>

      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(event) => setAccepted(event.target.checked)}
          className="mt-1"
        />
        <span>
          I understand that pickup is available only within {maxRadiusKm} km.
        </span>
      </label>

      <Button disabled={!accepted} className="w-full sm:w-auto">
        Continue
      </Button>
    </div>
  );
}
