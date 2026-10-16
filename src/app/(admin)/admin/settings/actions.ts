"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/db/server";
import { storeSettingsSchema } from "@/lib/validation";
import type { StoreSettingsInput } from "@/lib/validation";
import { requireAdmin } from "@/server/auth";
import { DomainError } from "@/server/errors";
import {
  StoreSettingsError,
  updateStoreSettings,
} from "@/server/store-settings";

/**
 * Admin store-settings action.
 *
 * Opens with `requireAdmin()`, and the write is *also* gated by the
 * `store_settings_admin_write` RLS policy. That is deliberate duplication: this
 * page is admin-only, but the action is a public endpoint and the policy is what
 * makes a forgotten check a non-event rather than a vulnerability.
 *
 * Setting the coordinates here is what turns the 6 km delivery check on: every
 * pickup refuses with "the store location is not configured yet" until they are
 * filled in.
 */

export type StoreSettingsActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

/** The first error per field, which is all the form renders. */
function firstFieldError(error: {
  flatten: () => { fieldErrors: Record<string, string[] | undefined> };
}): Record<string, string> | undefined {
  const flattened = error.flatten().fieldErrors;
  const fieldErrors: Record<string, string> = {};

  for (const [field, messages] of Object.entries(flattened)) {
    const message = messages?.[0];
    if (message) fieldErrors[field] = message;
  }

  return Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined;
}

export async function saveStoreSettingsAction(
  input: StoreSettingsInput,
): Promise<StoreSettingsActionResult> {
  const parsed = storeSettingsSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ??
        "Please check the settings and try again.",
      fieldErrors: firstFieldError(parsed.error),
    };
  }

  try {
    const admin = await requireAdmin();
    const supabase = await createClient();

    const saved = await updateStoreSettings(supabase, admin.profile.id, {
      lat: parsed.data.lat,
      lng: parsed.data.lng,
      maxRadiusKm: parsed.data.maxRadiusKm,
      address: parsed.data.address || null,
      whatsappNumber: parsed.data.whatsappNumber || null,
      gstin: parsed.data.gstin || null,
    });

    revalidatePath("/admin/settings");
    // The public Contact section reads the address, hours and WhatsApp number
    // from this row.
    revalidatePath("/");
    // /book centres its map on the store point when one is set.
    revalidatePath("/book");

    return {
      ok: true,
      message:
        saved.lat === null || saved.lng === null
          ? "Saved. Set the coordinates to turn the delivery-zone check on."
          : `Saved. Pickups are now zoned from ${saved.lat.toFixed(4)}, ${saved.lng.toFixed(4)}.`,
    };
  } catch (error) {
    if (error instanceof StoreSettingsError) {
      return { ok: false, message: error.userMessage };
    }

    if (error instanceof DomainError) {
      return { ok: false, message: error.userMessage };
    }

    console.error("Could not save the store settings", error);
    return {
      ok: false,
      message: "We could not save the store settings. Please try again.",
    };
  }
}
