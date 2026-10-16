/** Small formatting helpers shared by the booking wizard steps. */

/**
 * Normalises a typed mobile number to the E.164-ish form Supabase expects.
 *
 * Ten digits are assumed to be Indian and get a +91 prefix; a leading trunk 0
 * or a bare 91 country code is absorbed so the same number typed three ways
 * resolves to one value.
 */
export function normalizeMobile(input: string): string {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, "");

  if (!digits) return trimmed;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) {
    return `+91${digits.slice(1)}`;
  }
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;

  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

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
