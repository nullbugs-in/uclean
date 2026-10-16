/**
 * One canonical form for every customer mobile number.
 *
 * UClean is an Indian service, so a number is stored as E.164 with the +91
 * country code: `+919876543210`. Everything that reads or writes a mobile number
 * goes through here first, because the failure mode this prevents is subtle:
 * `9876543210`, `09876543210`, `919876543210` and `+919876543210` are the same
 * person, and if they are allowed to reach the database as four different
 * strings then the same customer gets four accounts and the rate limiter counts
 * each of them as an unrelated number.
 *
 * The server treats this as the authority. The browser normalises too, purely so
 * the customer sees the number they typed confirmed in the UI, but a value that
 * never passed through here is not trusted.
 */

/** UClean's country calling code. */
export const DEFAULT_COUNTRY_CODE = "91";

/** Length of the national significant number, without the country code. */
const NATIONAL_NUMBER_LENGTH = 10;

/**
 * Every Indian mobile number starts with 6, 7, 8 or 9.
 *
 * This is what stops a ten digit number from another country being quietly
 * relabelled as Indian. Without it, `2025550123` becomes `+912025550123` and a
 * one-time code is sent to a stranger. UClean only collects in India, so a
 * ten digit number starting with 2 to 5 is a typo rather than a customer.
 */
const INDIAN_MOBILE_START = /^[6-9]/;

/**
 * Rewrites a typed number into canonical E.164.
 *
 * Absorbs the shapes people actually type: spaces, dashes, brackets, a leading
 * trunk `0`, and a `91` typed on its own. Returns `null` rather than a
 * best-effort guess when the result would not be a complete Indian mobile
 * number, so a typo is reported instead of silently sent to a stranger.
 */
export function canonicalizeMobile(input: string): string | null {
  // Digits only. Strips every separator, including a leading +.
  const digits = input.replace(/\D/g, "");

  const withCountryCode = (national: string) =>
    INDIAN_MOBILE_START.test(national)
      ? `+${DEFAULT_COUNTRY_CODE}${national}`
      : null;

  if (digits.length === NATIONAL_NUMBER_LENGTH) {
    return withCountryCode(digits);
  }

  // A typed country code, with or without the national trunk prefix.
  if (digits.startsWith(DEFAULT_COUNTRY_CODE)) {
    return withCountryCode(digits.slice(DEFAULT_COUNTRY_CODE.length));
  }

  if (digits.startsWith(`0${DEFAULT_COUNTRY_CODE}`)) {
    return withCountryCode(digits.slice(DEFAULT_COUNTRY_CODE.length + 1));
  }

  // A leading 0 is the Indian trunk prefix, so drop it and try once more.
  if (digits.startsWith("0") && digits.length === NATIONAL_NUMBER_LENGTH + 1) {
    return withCountryCode(digits.slice(1));
  }

  return null;
}

/**
 * The national number for display: `98765 43210`, the way it is written here.
 *
 * Grouping is a presentation concern and is never stored, so it cannot become a
 * second way for the same customer to be recorded.
 */
export function formatMobileForDisplay(canonical: string): string {
  const digits = canonical
    .replace(/\D/g, "")
    .slice(DEFAULT_COUNTRY_CODE.length);

  if (digits.length !== NATIONAL_NUMBER_LENGTH) return canonical;

  return `${digits.slice(0, 5)} ${digits.slice(5)}`;
}
