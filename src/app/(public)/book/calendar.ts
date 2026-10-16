/**
 * Calendar maths for the booking picker's month grid.
 *
 * Kept apart from the component, the way `service-selection.ts` is, so the
 * rules can be tested without React: what a month looks like, and which of its
 * days a customer is allowed to choose.
 */

import { daysInMonth, leadingBlanks } from "./format";

/** A month, as a year plus a zero-based month index. */
export type Month = { year: number; month: number };

/** A month that can be compared as a string, so paging needs no date maths. */
export type KeyedMonth = Month & { key: string };

/** One rendered cell: a real day, or a blank that holds the grid's shape. */
export type MonthCell =
  | { kind: "blank" }
  | { kind: "day"; dateKey: string; dayNumber: number; available: boolean };

/** The bit of a `SlotDay` the calendar needs, so callers may pass a map. */
export type PickableDay = { isBlocked: boolean; slots: unknown[] };

/**
 * The month a `YYYY-MM-DD` key falls in.
 *
 * Falls back to the current month rather than to the epoch, so a caller with no
 * window to anchor to still opens on a month worth looking at.
 */
export function monthOf(dateKey: string | null): KeyedMonth {
  const parts = (dateKey ?? "").split("-").map(Number);
  const hasDate =
    parts.length === 3 && parts.every((part) => Number.isFinite(part));

  const today = new Date();
  const year =
    hasDate && parts[0] !== undefined ? parts[0] : today.getFullYear();
  const month =
    hasDate && parts[1] !== undefined ? parts[1] - 1 : today.getMonth();

  return { year, month, key: `${year}-${month}` };
}

/** Steps a month forwards or backwards, rolling the year over as needed. */
export function addMonths(current: Month, delta: number): KeyedMonth {
  const shifted = new Date(current.year, current.month + delta, 1);

  return {
    year: shifted.getFullYear(),
    month: shifted.getMonth(),
    key: `${shifted.getFullYear()}-${shifted.getMonth()}`,
  };
}

/** The `YYYY-MM-DD` key for a day inside a month. */
export function dateKeyOf(year: number, month: number, dayNumber: number) {
  const monthPart = String(month + 1).padStart(2, "0");
  const dayPart = String(dayNumber).padStart(2, "0");
  return `${year}-${monthPart}-${dayPart}`;
}

/**
 * Lays a month out Monday-first, marking each day bookable or not.
 *
 * Days are looked up by exact key rather than by index, so anything outside the
 * fetched window is simply not in the map and comes out unavailable. That keeps
 * the calendar honest if the window ever stops being a plain run of days from
 * today, and it is what makes a past day read as unavailable without needing a
 * separate "is it in the past" rule.
 */
export function buildMonthCells(
  visible: Month,
  byDate: Map<string, PickableDay>,
): MonthCell[] {
  const cells: MonthCell[] = [];

  for (let i = 0; i < leadingBlanks(visible.year, visible.month); i += 1) {
    cells.push({ kind: "blank" });
  }

  const total = daysInMonth(visible.year, visible.month);

  for (let dayNumber = 1; dayNumber <= total; dayNumber += 1) {
    const dateKey = dateKeyOf(visible.year, visible.month, dayNumber);
    const entry = byDate.get(dateKey);

    cells.push({
      kind: "day",
      dateKey,
      dayNumber,
      available: isBookable(entry),
    });
  }

  return cells;
}

/**
 * Whether a customer may pick this day.
 *
 * Three ways to be unable to, and they mean different things to the customer,
 * so the grid renders them all the same but the messages below the grid do not:
 * a blocked day is the store being closed, an empty slot list is the day being
 * fully booked, and a missing entry is the day being outside the horizon.
 */
export function isBookable(entry: PickableDay | undefined): boolean {
  return Boolean(entry && !entry.isBlocked && entry.slots.length > 0);
}
