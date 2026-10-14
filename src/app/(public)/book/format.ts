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
