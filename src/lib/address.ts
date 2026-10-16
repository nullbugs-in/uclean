/**
 * Shared rules for a customer's saved pickup addresses.
 *
 * Kept apart from both the server write path and the profile UI so the two agree
 * on what "the same address" means. That agreement is the whole point: the write
 * path uses it to avoid storing a near-duplicate, and it is what stops a customer
 * who types "flat2, main rd" today and "Flat 2, Main Rd" next time from ending
 * up with two rows and two different prefill suggestions.
 */

import type { Address } from "@/db/types";

/**
 * Shortest address the wizard accepts.
 *
 * Exported from here rather than written inline at each of the three places it
 * used to appear (the booking schema, the address step's Continue button, and
 * the save action), so the three cannot drift apart and start disagreeing about
 * whether a given address is long enough.
 */
export const MIN_ADDRESS_LENGTH = 10;

/** Longest address stored, matching the booking schema's cap. */
export const MAX_ADDRESS_LENGTH = 500;

/** Shortest label a customer can give an address. */
export const MIN_LABEL_LENGTH = 1;

/**
 * Reduces an address to a form where cosmetic differences disappear.
 *
 * Case, repeated whitespace and a trailing separator are all things people vary
 * between two visits without meaning anything different by them. Deliberately
 * conservative: it does not strip punctuation in the middle, reorder words, or
 * expand abbreviations, because two genuinely different addresses can differ by
 * as little as a house number and over-eager normalisation would merge them.
 */
export function normalizeAddressForComparison(address: string): string {
  return address
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[\s,;]+$/, "");
}

/** Whether two addresses are the same place, for the purpose of not duplicating. */
export function isSameAddress(a: string, b: string): boolean {
  return normalizeAddressForComparison(a) === normalizeAddressForComparison(b);
}

/**
 * The address worth prefilling: the default, else the most recent.
 *
 * `listAddresses` already orders defaults first and then newest first, so the
 * first row is the answer. This is the same rule stated once, in case that
 * ordering is ever changed.
 */
export function pickDefaultAddress(addresses: Address[]): Address | null {
  if (addresses.length === 0) return null;

  return (
    addresses.find((address) => address.is_default) ?? addresses[0] ?? null
  );
}

/** Whether an address is long enough to be worth storing or offering. */
export function isUsableAddress(address: string): boolean {
  return address.trim().length >= MIN_ADDRESS_LENGTH;
}

/**
 * The label to fall back on.
 *
 * The column already defaults to 'Home', but every row this application creates
 * is explicitly labelled, so the fallback exists for rows created by something
 * else rather than for our own writes.
 */
export const DEFAULT_ADDRESS_LABEL = "Pickup address";
