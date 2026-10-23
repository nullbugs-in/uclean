import "server-only";

import type {
  DbClient,
  Json,
  WhatsAppSettings,
  WhatsAppTemplateMapping,
} from "@/db/types";

import { writeAudit } from "./audit";

/**
 * WhatsApp integration settings writes, for the admin Settings page.
 *
 * Out of the `"use server"` action file so it is ordinary server code that
 * takes a client and can be tested against a fake, exactly like
 * `store-settings.ts` - the same read-modify-write shape, the same
 * missing-singleton-is-an-environment-fault stance, the same reason: the
 * audit entry needs a real `before`.
 *
 * Writes use the request-scoped client on purpose: the
 * `whatsapp_settings_admin_update` RLS policy (migration 23) is what
 * authorises them, so the database is the gate as well as the calling action.
 *
 * Nothing here ever touches a credential. The Cloud API access token and
 * phone number id live in the server environment; including them in an audit
 * payload would be impossible from this module, and that is the point.
 */

export class WhatsAppSettingsError extends Error {
  constructor(
    message: string,
    readonly userMessage: string,
  ) {
    super(message);
    this.name = "WhatsAppSettingsError";
  }
}

export type WhatsAppSettingsUpdate = {
  enabled: boolean;
  templateMapping: WhatsAppTemplateMapping;
};

/**
 * The fields the audit trail records - the two being written. Nothing else on
 * the row is editable from the panel, so an audit diff of anything wider
 * would only add noise.
 */
function auditable(row: WhatsAppSettings): Json {
  return {
    enabled: row.enabled,
    template_mapping: row.template_mapping,
  };
}

/** Reads the singleton, or null when the row has not been written yet. */
export async function getWhatsAppSettings(
  client: DbClient,
): Promise<WhatsAppSettings | null> {
  const { data, error } = await client
    .from("whatsapp_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return data as WhatsAppSettings | null;
}

/**
 * Writes the integration switch and the template mapping, and records what
 * changed.
 */
export async function updateWhatsAppSettings(
  client: DbClient,
  actorId: string,
  update: WhatsAppSettingsUpdate,
): Promise<WhatsAppSettings> {
  const { data: before, error: readError } = await client
    .from("whatsapp_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();

  if (readError) throw new Error(readError.message);

  if (!before) {
    throw new WhatsAppSettingsError(
      "whatsapp_settings row is missing",
      "The WhatsApp settings row is missing. Apply migration 23 before saving.",
    );
  }

  const { data: after, error } = await client
    .from("whatsapp_settings")
    .update({
      enabled: update.enabled,
      template_mapping: update.templateMapping,
    })
    .eq("id", true)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (!after) {
    throw new WhatsAppSettingsError(
      "whatsapp_settings update returned no row",
      "We could not save the WhatsApp settings. Please try again.",
    );
  }

  await writeAudit(client, {
    actorId,
    action: "whatsapp_settings.updated",
    entity: "whatsapp_settings",
    // The singleton is a singleton, so a stringified key is all there is.
    entityId: "true",
    before: auditable(before),
    after: auditable(after),
  });

  return after;
}

/**
 * Records the outcome of the admin panel's test message, which is what the
 * connection status reads.
 *
 * A null `ok` is not expressible here: every test has an answer. The failing
 * case carries Meta's (or the network's) error text so the admin sees the
 * reason next to the button that produced it.
 */
export async function recordWhatsAppTestResult(
  client: DbClient,
  outcome: { ok: boolean; error?: string },
): Promise<void> {
  const { error } = await client
    .from("whatsapp_settings")
    .update({
      last_test_ok: outcome.ok,
      last_test_at: new Date().toISOString(),
      last_test_error: outcome.ok ? null : (outcome.error ?? null),
    })
    .eq("id", true);

  if (error) {
    // The test message was already sent (or refused); losing its log line is
    // bad, failing the action because its log line did not land is worse.
    console.error("Could not record the WhatsApp test result", error);
  }
}
