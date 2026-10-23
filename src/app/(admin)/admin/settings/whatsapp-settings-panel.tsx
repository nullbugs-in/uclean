import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/db/server";
import { getWhatsAppSettings } from "@/server/whatsapp-settings";
import { whatsappCredentialsFromEnv } from "@/server/whatsapp-provider";

import {
  type WhatsAppStatus,
  whatsappIntegrationStatus,
} from "./whatsapp-status";
import { WhatsAppSettingsForm } from "./whatsapp-settings-form";

/**
 * The WhatsApp integration card, under the store card on the Settings page.
 *
 * The status badge is derived from three independent facts, because "is it
 * working" is not one fact:
 *
 *   - `credentials` - the Cloud API token and phone number id exist in the
 *     server environment. Reported only as present or absent; the value is
 *     never read into the browser.
 *   - `enabled` - the admin's switch, stored in whatsapp_settings.
 *   - the last test message's outcome, which is what a green badge actually
 *     means: an enabled integration whose test failed is shown as failed, not
 *     as active.
 */
export async function WhatsAppSettingsPanel() {
  const supabase = await createClient();
  const settings = await getWhatsAppSettings(supabase).catch(() => null);

  const credentialsConfigured = whatsappCredentialsFromEnv() !== null;
  const status: WhatsAppStatus = whatsappIntegrationStatus(
    settings,
    credentialsConfigured,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">WhatsApp</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <WhatsAppSettingsForm
          settings={settings}
          status={status}
          credentialsConfigured={credentialsConfigured}
        />

        {!credentialsConfigured ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
            Cloud API credentials are not configured on the server. Set
            WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN in the
            environment; the panel cannot display or edit them.
          </p>
        ) : null}

        <p className="text-xs text-[var(--muted-foreground)]">
          Credentials live in the server environment (the access token is never
          shown, and re-entering one means editing the env, not this panel).
          Sending goes through the notification queue worker, which maps each
          message to the Meta-approved template entered above; delivery receipts
          arrive on the WhatsApp webhook. Sending a test message records its
          outcome here and in the Notifications message log.
        </p>
      </CardContent>
    </Card>
  );
}
