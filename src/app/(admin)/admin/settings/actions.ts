"use server";

import { revalidatePath } from "next/cache";

import type { WhatsAppTemplateMapping } from "@/db/types";
import { createClient, createServiceClient } from "@/db/server";
import { storeSettingsSchema } from "@/lib/validation";
import type { StoreSettingsInput } from "@/lib/validation";
import { whatsappSettingsSchema, whatsappTestSchema } from "@/lib/validation";
import type {
  WhatsAppSettingsInput,
  WhatsAppTestInput,
} from "@/lib/validation";
import { requireAdmin } from "@/server/auth";
import { DomainError } from "@/server/errors";
import {
  StoreSettingsError,
  updateStoreSettings,
} from "@/server/store-settings";
import {
  getWhatsAppSettings,
  recordWhatsAppTestResult,
  updateWhatsAppSettings,
  WhatsAppSettingsError,
} from "@/server/whatsapp-settings";
import {
  sendWhatsAppTemplate,
  whatsappCredentialsFromEnv,
} from "@/server/whatsapp-provider";

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

/** Same shape for the two WhatsApp actions. */
export type WhatsAppSettingsActionResult =
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

/**
 * Admin WhatsApp-integration actions.
 *
 * Same trust shape as the store-settings action above: `requireAdmin()` first,
 * and the write/singleton read is *also* gated by the
 * `whatsapp_settings_admin_update` / `_admin_select` RLS policies (migration
 * 23). The access token and phone number id are never accepted here - they
 * live in the server environment - so a saved setting cannot leak one.
 */

/**
 * Saves the integration switch and the template mapping.
 *
 * The supplier's mapping is not validated against Meta here: a template name
 * that Meta has not approved only proves itself a failure when someone sends
 * it, and the message log records that - which is the discoverable moment.
 */
export async function saveWhatsAppSettingsAction(
  input: WhatsAppSettingsInput,
): Promise<WhatsAppSettingsActionResult> {
  const parsed = whatsappSettingsSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ??
        "Please check the WhatsApp settings and try again.",
      fieldErrors: firstFieldError(parsed.error),
    };
  }

  try {
    const admin = await requireAdmin();
    const supabase = await createClient();

    const saved = await updateWhatsAppSettings(supabase, admin.profile.id, {
      enabled: parsed.data.enabled,
      templateMapping: parsed.data.templateMapping as WhatsAppTemplateMapping,
    });

    revalidatePath("/admin/settings");

    return {
      ok: true,
      message: saved.enabled
        ? "Saved. WhatsApp sending is enabled; the notification queue will use the template mapping."
        : "Saved. WhatsApp sending is disabled until the integration is turned on.",
    };
  } catch (error) {
    if (error instanceof WhatsAppSettingsError) {
      return { ok: false, message: error.userMessage };
    }

    if (error instanceof DomainError) {
      return { ok: false, message: error.userMessage };
    }

    console.error("Could not save the WhatsApp settings", error);
    return {
      ok: false,
      message: "We could not save the WhatsApp settings. Please try again.",
    };
  }
}

/**
 * Sends one real template message and records the outcome.
 *
 * This is a send, not a dry credential check, because a template name Meta
 * has not approved is exactly the configuration mistake to catch, and only
 * Cloud API's response knows it. The attempt is recorded twice on purpose:
 * `whatsapp_settings.last_test_*` for the connection status next to the
 * button, and a row in `notifications` so the message log shows the attempt
 * (that table has no client-side insert policy; the queue worker has always
 * written it as the service role).
 */
export async function sendWhatsAppTestMessageAction(
  input: WhatsAppTestInput,
): Promise<WhatsAppSettingsActionResult> {
  const parsed = whatsappTestSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ??
        "Please check the test message and try again.",
      fieldErrors: firstFieldError(parsed.error),
    };
  }

  const { destination, template } = parsed.data;

  const credentials = whatsappCredentialsFromEnv();
  if (!credentials) {
    return {
      ok: false,
      message:
        "WhatsApp Cloud API credentials are not configured on the server. Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN in the environment.",
    };
  }

  try {
    const admin = await requireAdmin();
    const supabase = await createClient();

    const settings = await getWhatsAppSettings(supabase);
    const mapping = (settings?.template_mapping ??
      {}) as WhatsAppTemplateMapping;
    const config = mapping[template];

    if (!config?.name) {
      await recordWhatsAppTestResult(supabase, {
        ok: false,
        error: `Template ${template} has no Meta mapping.`,
      });
      revalidatePath("/admin/settings");
      return {
        ok: false,
        message: `Map the ${template} template to an approved Meta template name before sending.`,
      };
    }

    const outcome = await sendWhatsAppTemplate(credentials, destination, {
      name: config.name,
      language: config.language,
    });

    await recordWhatsAppTestResult(supabase, {
      ok: outcome.ok,
      error: outcome.ok ? undefined : outcome.error,
    });

    // Visible in the admin message log either way: last_error and
    // provider_message_id are exactly what the log page shows for any row.
    const service = createServiceClient();
    const { error: logError } = await service.from("notifications").insert({
      user_id: admin.profile.id,
      destination,
      channel: "whatsapp",
      template,
      payload: { test_message: true, meta_template: config.name },
      status: outcome.ok ? "sent" : "failed",
      provider_message_id: outcome.ok ? outcome.providerMessageId : null,
      last_error: outcome.ok ? null : outcome.error,
      sent_at: outcome.ok ? new Date().toISOString() : null,
    });
    if (logError) {
      console.error("Could not log the WhatsApp test message", logError);
    }

    revalidatePath("/admin/settings");
    revalidatePath("/admin/notifications");

    if (!outcome.ok) {
      return { ok: false, message: outcome.error };
    }

    return {
      ok: true,
      message: `Test message sent to ${destination} as template ${config.name}.`,
    };
  } catch (error) {
    if (error instanceof DomainError) {
      return { ok: false, message: error.userMessage };
    }

    console.error("Could not send the WhatsApp test message", error);
    return {
      ok: false,
      message:
        "We could not send the test message. Check the server credentials and try again.",
    };
  }
}
