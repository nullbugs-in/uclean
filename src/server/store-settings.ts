import "server-only";

import type { DbClient, Json, StoreSettings } from "@/db/types";

import { writeAudit } from "./audit";

/**
 * Store settings writes, for the admin Settings page.
 *
 * Takes the request-scoped client rather than the service role on purpose: the
 * `store_settings_admin_write` RLS policy is what authorises the write, so the
 * database is the gate as well as the calling action. The service role is
 * reserved for the paths that genuinely have no policy behind them, and this is
 * not one of them.
 *
 * Out of the `"use server"` action file so it is ordinary server code that takes
 * a client and can be tested against a fake, the same shape as `addresses.ts`.
 */

export class StoreSettingsError extends Error {
  constructor(
    message: string,
    readonly userMessage: string,
  ) {
    super(message);
    this.name = "StoreSettingsError";
  }
}

export type StoreSettingsUpdate = {
  lat: number | null;
  lng: number | null;
  maxRadiusKm: number;
  address: string | null;
  whatsappNumber: string | null;
  gstin: string | null;
};

/**
 * The fields the audit trail records.
 *
 * A subset rather than the whole row: `opening_time` and friends are not edited
 * here, so putting them in the audit row would only add noise to every diff.
 */
function auditable(row: StoreSettings): Json {
  return {
    lat: row.lat,
    lng: row.lng,
    max_radius_km: row.max_radius_km,
    address: row.address,
    whatsapp_number: row.whatsapp_number,
    gstin: row.gstin,
  };
}

/**
 * Writes the store settings singleton and records what changed.
 *
 * Reads the row first so the audit entry can carry a real `before`. A missing
 * row is an error rather than an upsert: the row is created by the seed, and a
 * silent insert here would hide a broken environment.
 */
export async function updateStoreSettings(
  client: DbClient,
  actorId: string,
  update: StoreSettingsUpdate,
): Promise<StoreSettings> {
  const { data: before, error: readError } = await client
    .from("store_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();

  if (readError) throw new Error(readError.message);

  if (!before) {
    throw new StoreSettingsError(
      "store_settings row is missing",
      "The store settings row is missing. Run the seed before saving.",
    );
  }

  const { data: after, error } = await client
    .from("store_settings")
    .update({
      lat: update.lat,
      lng: update.lng,
      max_radius_km: update.maxRadiusKm,
      address: update.address,
      whatsapp_number: update.whatsappNumber,
      gstin: update.gstin,
    })
    .eq("id", true)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (!after) {
    throw new StoreSettingsError(
      "store_settings update returned no row",
      "We could not save the store settings. Please try again.",
    );
  }

  await writeAudit(client, {
    actorId,
    action: "store_settings.updated",
    entity: "store_settings",
    // `store_settings` is a singleton keyed by `id = true`, so the stringified
    // key is the entity id.
    entityId: "true",
    before: auditable(before),
    after: auditable(after),
  });

  return after;
}
