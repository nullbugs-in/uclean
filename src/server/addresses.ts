import "server-only";

import { listAddresses } from "@/db/queries/profiles";
import type { Address, DbClient } from "@/db/types";

import {
  DEFAULT_ADDRESS_LABEL,
  MAX_ADDRESS_LENGTH,
  MIN_ADDRESS_LENGTH,
  isSameAddress,
  pickDefaultAddress,
} from "@/lib/address";

/**
 * Address writes for a signed-in customer.
 *
 * Out of the `"use server"` action file on purpose: this is ordinary server code
 * that takes a client, which makes it testable against a fake without going near
 * the action plumbing, and it is callable from more than one place.
 *
 * Every function here takes the request-scoped client, so the
 * `addresses_all_owner` RLS policy is the only thing standing between a customer
 * and the table. There is deliberately no code path that writes through the
 * service role: an address is always the owner's own, and a bug that reached for
 * elevated access would be a bug that could rewrite someone else's address.
 */

export class AddressError extends Error {
  constructor(
    message: string,
    readonly userMessage: string,
  ) {
    super(message);
    this.name = "AddressError";
  }
}

/**
 * Stores an address as the customer's default, reusing an equivalent row.
 *
 * The `addresses_one_default_per_user` partial unique index means a second
 * default row would be rejected outright, and the index is not deferrable, so
 * the existing default is cleared before the new one is written. That is a
 * three-step dance rather than one statement, and it is why this cannot simply
 * be an upsert on the unique column.
 *
 * An address that already exists in a form we consider the same is promoted to
 * default rather than duplicated, which is what stops a customer's profile
 * filling with "Flat 2, Main Road" and "flat2 main road" after a few bookings.
 *
 * Not atomic: a failure between clearing and writing leaves the customer with no
 * default. That is recoverable and invisible, because every read here falls back
 * to "the most recent row" when no default is set.
 */
export async function saveDefaultAddress(
  client: DbClient,
  userId: string,
  input: { addressText: string; lat: number; lng: number },
): Promise<Address> {
  const addressText = input.addressText.trim();

  if (addressText.length < MIN_ADDRESS_LENGTH) {
    throw new AddressError(
      `address too short: ${addressText.length} characters`,
      "Please enter your full pickup address before saving it.",
    );
  }

  if (addressText.length > MAX_ADDRESS_LENGTH) {
    throw new AddressError(
      "address too long",
      "That address is too long to save.",
    );
  }

  const existing = await listAddresses(client, userId);

  const same = existing.find((entry) =>
    isSameAddress(entry.address_text, addressText),
  );

  const { error: clearError } = await client
    .from("addresses")
    .update({ is_default: false })
    .eq("user_id", userId)
    .eq("is_default", true);

  if (clearError) throw new Error(clearError.message);

  if (same) {
    const { data, error } = await client
      .from("addresses")
      .update({ is_default: true, lat: input.lat, lng: input.lng })
      .eq("id", same.id)
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  const { data, error } = await client
    .from("addresses")
    .insert({
      user_id: userId,
      label: DEFAULT_ADDRESS_LABEL,
      address_text: addressText,
      lat: input.lat,
      lng: input.lng,
      is_default: true,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Edits one of the customer's own addresses.
 *
 * Scoped by `user_id` as well as `id`, so even if the id belongs to somebody
 * else the update matches nothing rather than reaching across. RLS would stop it
 * too; doing it in the query means the customer gets a clean "not found" instead
 * of a permission error.
 */
export async function updateAddress(
  client: DbClient,
  userId: string,
  input: { id: string; addressText: string; label?: string },
): Promise<Address> {
  const addressText = input.addressText.trim();

  if (addressText.length < MIN_ADDRESS_LENGTH) {
    throw new AddressError(
      "address too short",
      "Please enter your full pickup address.",
    );
  }

  const patch: { address_text?: string; label?: string } = {
    address_text: addressText,
  };

  if (input.label !== undefined) {
    const label = input.label.trim().slice(0, 40);
    if (label) patch.label = label;
  }

  const { data, error } = await client
    .from("addresses")
    .update(patch)
    .eq("id", input.id)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (!data) {
    throw new AddressError(
      "address not found for this user",
      "That address could not be found.",
    );
  }

  return data;
}

/**
 * Promotes one of the customer's addresses to be the default.
 *
 * Clears the current default first for the same unique-index reason as
 * `saveDefaultAddress`. The target is re-read afterwards so the returned row
 * reflects the new ordering.
 */
export async function setDefaultAddress(
  client: DbClient,
  userId: string,
  id: string,
): Promise<Address[]> {
  const { error: clearError } = await client
    .from("addresses")
    .update({ is_default: false })
    .eq("user_id", userId)
    .eq("is_default", true);

  if (clearError) throw new Error(clearError.message);

  const { data, error } = await client
    .from("addresses")
    .update({ is_default: true })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (!data) {
    throw new AddressError(
      "address not found for this user",
      "That address could not be found.",
    );
  }

  return listAddresses(client, userId);
}

/**
 * Removes one of the customer's addresses.
 *
 * Deleting the default is allowed. Nothing requires a default to exist: every
 * read falls back to the most recent row, and the next booking immediately
 * writes a new one.
 */
export async function deleteAddress(
  client: DbClient,
  userId: string,
  id: string,
): Promise<Address[]> {
  const { data, error } = await client
    .from("addresses")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (!data) {
    throw new AddressError(
      "address not found for this user",
      "That address could not be found.",
    );
  }

  return listAddresses(client, userId);
}

/**
 * The address to prefill on the booking page.
 *
 * Used after a customer verifies their number mid-wizard, which is the common
 * case: the page was rendered while they were signed out, so the server render
 * had no address to offer and this is the only chance to give them one.
 */
export async function getPrefillAddress(
  client: DbClient,
  userId: string,
): Promise<Address | null> {
  const addresses = await listAddresses(client, userId);
  return pickDefaultAddress(addresses);
}
