/** Small formatting helpers shared by the booking wizard steps. */

/*
 * Mobile normalisation used to live here as `normalizeMobile`, and the wizard
 * applied it while `/auth/login` did not, so the same person could end up with
 * two accounts depending on which page they used. It now lives in
 * `@/lib/mobile` and runs inside the request schemas instead, on the server as
 * well as in the browser. Nothing imports it from here any more.
 */

/** Parses a YYYY-MM-DD key as local midnight, avoiding a UTC day shift. */
function parseDateKey(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00`);
}

export function formatWeekday(dateKey: string): string {
  return new Intl.DateTimeFormat("en-IN", { weekday: "short" }).format(
    parseDateKey(dateKey),
  );
}

export function formatDayNumber(dateKey: string): string {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric" }).format(
    parseDateKey(dateKey),
  );
}

export function formatFullDate(dateKey: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parseDateKey(dateKey));
}

/**
 * A month heading, e.g. "March 2026".
 *
 * Takes a year and a zero-based month index rather than a date key, because the
 * picker navigates by month and most of the months it can reach are partly or
 * entirely outside any single 60-day window.
 */
export function formatMonthYear(year: number, month: number): string {
  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month, 1));
}

/** Weekday initials, Monday first, for the calendar's header row. */
export const WEEKDAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"] as const;

/**
 * How many blank cells precede the 1st of a month in a Monday-first grid.
 *
 * `Date.getDay()` is Sunday-zero, so Monday-first means moving Sunday to the end
 * of the week rather than subtracting one, which would also land the weekday
 * columns a day out.
 */
export function leadingBlanks(year: number, month: number): number {
  const dayOfWeek = new Date(year, month, 1).getDay();
  return dayOfWeek === 0 ? 6 : dayOfWeek - 1;
}

/** The number of days in a month, leap years included. */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}
