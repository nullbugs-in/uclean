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

/**
 * The store's timezone.
 *
 * Hardcoded rather than a column, matching `book_pickup` in migration 13. One
 * store in one zone; a second zone belongs with multi-store work.
 */
export const STORE_TIME_ZONE = "Asia/Kolkata";

const storeClock = new Intl.DateTimeFormat("en-CA", {
  timeZone: STORE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * The store's wall clock now.
 *
 * Slot dates and the booking cut-off both mean "where the store is", and the
 * process serving them does not have to be: a hosted function runs in UTC, so
 * reading `new Date()` directly would place the store's evening five and a half
 * hours early and make the wizard disagree with the database, which enforces the
 * same rule in `Asia/Kolkata`.
 *
 * Returns a `Date` whose *local* fields are the store's, not an instant. The
 * offset is discarded on purpose: nothing here is ever compared against another
 * instant or added to one, only read for a day key or for minutes past midnight.
 */
export function storeNow(now: Date = new Date()): Date {
  const parts = Object.fromEntries(
    storeClock.formatToParts(now).map((part) => [part.type, part.value]),
  );

  // `en-CA` renders the date as YYYY-MM-DD, which is exactly the key shape
  // `toDateKey` produces, so the day half can be handed straight back to the
  // local-time parser rather than reassembled field by field.
  return new Date(
    `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00`,
  );
}

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
