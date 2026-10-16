/**
 * Local calendar-day helpers.
 *
 * Slot dates (`pickup_slot_date`, `delivery_slot_date`) are plain YYYY-MM-DD
 * values meaning "that day, where the store is". Two things follow: the key
 * must be built from local time, and a bare key must be parsed with an explicit
 * midnight, because `new Date("2026-10-15")` is read as UTC and would move an
 * evening slot back a day for anyone west of the server's meridian.
 *
 * `src/server/slots.ts` carries its own copy of `toDateKey` because that module
 * is "server-only" and this one must stay importable from the query layer,
 * which sits below the server layer.
 */

/** Local day key, YYYY-MM-DD. */
export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Parses a local day key back to midnight, for formatting and day maths. */
export function fromDateKey(key: string): Date {
  return new Date(`${key}T00:00:00`);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
