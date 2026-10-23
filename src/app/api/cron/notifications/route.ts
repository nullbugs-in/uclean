import { NextResponse, type NextRequest } from "next/server";

import { createServiceClient } from "@/db/server";
import type { WhatsAppTemplateMapping } from "@/db/types";
import { requireCronAuth } from "@/server/cron-auth";
import {
  processNotificationQueue,
  setNotificationSender,
} from "@/server/notifications";
import {
  makeCloudApiSender,
  whatsappCredentialsFromEnv,
} from "@/server/whatsapp-provider";

/**
 * Drains the notification queue.
 *
 * Scheduled via Vercel Cron. Requires the CRON_SECRET bearer token, because a
 * cron endpoint is otherwise a public URL anyone could hammer.
 *
 * Before the pass it wires the WhatsApp Cloud API sender from the admin
 * panel's integration state (`whatsapp_settings.enabled`, migration 23) and
 * the server environment's credentials. Serverless invocations share no
 * module state, so the sender is (re)injected per run instead of at module
 * bootstrap. With the integration disabled or credentials unconfigured, no
 * sender is injected and the queue keeps reporting its "no sender configured"
 * failure - the same, honest behaviour as before the client existed.
 */
export async function GET(request: NextRequest) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;

  try {
    await wireSender();

    const results = await processNotificationQueue();
    const sent = results.filter((r) => r.status === "sent").length;
    const failed = results.filter((r) => r.status === "failed").length;

    return NextResponse.json({
      processed: results.length,
      sent,
      failed,
      results,
    });
  } catch (error) {
    console.error("Notification queue run failed", error);
    return NextResponse.json({ error: "Queue run failed" }, { status: 500 });
  }
}

async function wireSender() {
  const credentials = whatsappCredentialsFromEnv();
  if (!credentials) return;

  const service = createServiceClient();
  const { data, error } = await service
    .from("whatsapp_settings")
    .select("enabled, template_mapping")
    .eq("id", true)
    .maybeSingle();

  if (error) {
    // The queue still drains on the next pass; a settings read must not be
    // what turns the worker off entirely.
    console.error("Could not read WhatsApp integration settings", error);
    return;
  }

  if (!data?.enabled) return;

  setNotificationSender(
    makeCloudApiSender(
      credentials,
      (data.template_mapping ?? {}) as WhatsAppTemplateMapping,
    ),
  );
}
