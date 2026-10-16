"use client";

import { CalendarClock, Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { formatDayNumber, formatFullDate, formatWeekday } from "../format";
import type { SlotDay } from "../types";

import { DatePicker } from "./date-picker";

type SlotStepProps = {
  /** Every bookable day in the window, oldest first. */
  upcomingDays: SlotDay[] | null;
  loading: boolean;
  error: string | null;
  selectedDate: string | null;
  selectedSlotId: string | null;
  onSelectDate: (dateKey: string) => void;
  onSelectSlot: (slotId: string) => void;
  onBack: () => void;
  onContinue: () => void;
};

/** How many days the quick-pick strip shows. The rest live in the calendar. */
const STRIP_DAYS = 7;

/**
 * Step 4: pickup day and hourly slot.
 *
 * Two ways to choose the day, reading the same list: the strip for the next week
 * and the calendar icon for anything up to the two-month horizon. Both can only
 * offer a day the server said has a bookable slot, so neither can select
 * something the other would reject.
 *
 * Slots that are full or already past have been filtered out server side, so
 * every button here is actually bookable. The final capacity check still runs
 * inside book_pickup under a row lock.
 */
export function SlotStep({
  upcomingDays,
  loading,
  error,
  selectedDate,
  selectedSlotId,
  onSelectDate,
  onSelectSlot,
  onBack,
  onContinue,
}: SlotStepProps) {
  if (loading) {
    return (
      <div className="text-muted-foreground flex flex-col items-center gap-3 py-16 text-sm">
        <Loader2 className="size-6 animate-spin" aria-hidden="true" />
        Loading available pickup slots...
      </div>
    );
  }

  if (error || !upcomingDays) {
    return (
      <div className="space-y-4">
        <p role="alert" className="text-sm text-[var(--destructive)]">
          {error ?? "We could not load the available slots."}
        </p>
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
      </div>
    );
  }

  const activeDay =
    upcomingDays.find((day) => day.dateKey === selectedDate) ?? null;
  const hasAnySlot = upcomingDays.some((day) => day.slots.length > 0);
  const stripDays = upcomingDays.slice(0, STRIP_DAYS);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-medium">
            <CalendarClock className="size-4" aria-hidden="true" />
            Choose a pickup day
          </p>

          <DatePicker
            days={upcomingDays}
            selectedDate={selectedDate}
            onSelectDate={onSelectDate}
          />
        </div>

        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {stripDays.map((day) => {
            const disabled = day.isBlocked || day.slots.length === 0;
            const selected = day.dateKey === selectedDate;

            return (
              <button
                key={day.dateKey}
                type="button"
                disabled={disabled}
                aria-pressed={selected}
                onClick={() => onSelectDate(day.dateKey)}
                className={cn(
                  "flex flex-col items-center rounded-xl border px-2 py-2 text-center transition-colors",
                  selected
                    ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
                    : "border-[var(--border)] hover:bg-[var(--accent)]",
                  disabled &&
                    "cursor-not-allowed opacity-40 hover:bg-transparent",
                )}
              >
                <span className="text-xs font-medium">
                  {formatWeekday(day.dateKey)}
                </span>
                <span className="text-lg font-semibold">
                  {formatDayNumber(day.dateKey)}
                </span>
              </button>
            );
          })}
        </div>

        <p className="text-muted-foreground text-xs">
          Showing the next {stripDays.length} days. Use the calendar icon to
          book further ahead.
        </p>
      </div>

      {!hasAnySlot ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          No pickup slots are open at the moment. Please contact us on WhatsApp
          and we will arrange a pickup.
        </p>
      ) : activeDay ? (
        <div className="space-y-3">
          <p className="text-sm font-medium">
            Available times on {formatFullDate(activeDay.dateKey)}
          </p>

          {activeDay.isBlocked ? (
            <p className="text-muted-foreground text-sm">
              We are not taking pickups on this day. Please choose another.
            </p>
          ) : activeDay.slots.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Every slot on this day is taken. Please choose another day.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {activeDay.slots.map((slot) => {
                const selected = slot.id === selectedSlotId;

                return (
                  <button
                    key={slot.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onSelectSlot(slot.id)}
                    className={cn(
                      "flex items-center justify-between rounded-xl border px-3 py-2 text-sm transition-colors",
                      selected
                        ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
                        : "border-[var(--border)] hover:bg-[var(--accent)]",
                    )}
                  >
                    <span className="font-medium">{slot.label}</span>
                    {selected ? (
                      <Check className="size-4" aria-hidden="true" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          Pick a day above to see its pickup times.
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button
          type="button"
          onClick={onContinue}
          disabled={!selectedDate || !selectedSlotId}
          className="sm:min-w-40"
        >
          Review booking
        </Button>
      </div>
    </div>
  );
}
