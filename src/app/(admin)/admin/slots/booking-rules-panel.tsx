"use client";

import { Loader2, Save } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

import { saveBookingRulesAction } from "./actions";

/**
 * The booking cut-off (section 8.10).
 *
 * Kept on this page rather than folded into the Settings form because it is a
 * rule about *when a slot may be booked*, and the slots it governs are listed
 * directly above it. It writes to the same `store_settings` row as the Settings
 * page, so the two can never disagree -- an admin who sets it here and then
 * opens Settings sees the value they just saved.
 *
 * The preview sentence is rendered from what is currently typed rather than from
 * what is saved, so the effect of a number is legible before committing to it.
 * The server is still the one that decides: the input can only make the rule
 * visible, not apply it.
 */
export function BookingRulesPanel({
  cutoffMinutes,
}: {
  cutoffMinutes: number;
}) {
  const [value, setValue] = React.useState(String(cutoffMinutes));
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const raw = value.trim();

    startTransition(async () => {
      const result = await saveBookingRulesAction({
        // An empty box is a mistake rather than a request for a zero cut-off, so
        // it is sent as NaN and the schema complains rather than silently
        // opening every slot up to the current minute.
        cutoffMinutes: raw === "" ? Number.NaN : Number(raw),
      });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      setNotice(result.message);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-2">
          <Label htmlFor="booking_cutoff_minutes">Cut-off (minutes)</Label>
          <Input
            id="booking_cutoff_minutes"
            name="booking_cutoff_minutes"
            type="number"
            min={0}
            max={720}
            inputMode="numeric"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="w-32"
          />
        </div>

        <Button type="submit" disabled={isPending}>
          {isPending ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <Save aria-hidden="true" />
          )}
          Save cut-off
        </Button>

        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}

        {notice ? (
          <p className="text-muted-foreground text-sm" aria-live="polite">
            {notice}
          </p>
        ) : null}
      </div>

      <p className="text-muted-foreground text-sm">
        {describeCutoff(value)}
      </p>

      <p className="text-muted-foreground text-xs">
        Enforced in the database, not just on this screen: a booking whose slot
        starts inside the window is refused even if the request did not come from
        the booking form. The same rule hides the slot from the website and from
        the walk-in counter. Times are read in the store&rsquo;s timezone
        (Asia/Kolkata), so the window means the store&rsquo;s clock rather than
        the server&rsquo;s.
      </p>
    </form>
  );
}

/** Plain-English statement of what the typed number will do. */
function describeCutoff(raw: string): string {
  const minutes = Number(raw.trim());

  if (raw.trim() === "" || !Number.isFinite(minutes)) {
    return "Enter a number of minutes.";
  }

  if (!Number.isInteger(minutes) || minutes < 0) {
    return "Enter a whole number of minutes, 0 or more.";
  }

  if (minutes === 0) {
    return "Slots are bookable right up to the minute they start.";
  }

  return `Slots starting within ${minutes} minute${
    minutes === 1 ? "" : "s"
  } are hidden from customers and refused on booking.`;
}
