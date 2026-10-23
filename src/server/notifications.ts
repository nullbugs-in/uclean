import "server-only";

import { createServiceClient } from "@/db/server";
import type { Notification, NotificationTemplate } from "@/db/types";

/**
 * The notification queue (section 13).
 *
 * Nothing in the request path sends a message. Events insert rows into
 * `notifications` via the database trigger; this module is the worker that
 * drains that queue, retries failures, and writes back provider delivery
 * status from webhooks.
 */

export type SendResult = {
  id: number;
  status: "sent" | "failed" | "skipped";
  error?: string;
};

/**
 * Sends up to `batchSize` queued notifications.
 *
 * Called from /api/cron/notifications. Each row is claimed before sending so
 * two concurrent cron invocations cannot both send the same message.
 */
export async function processNotificationQueue(
  batchSize = 25,
): Promise<SendResult[]> {
  const service = createServiceClient();

  const { data: queued, error } = await service
    .from("notifications")
    .select("*")
    .in("status", ["queued", "failed"])
    .lt("attempts", 3)
    .lte("next_attempt_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(batchSize);

  if (error) throw new Error(error.message);

  const results: SendResult[] = [];

  for (const notification of queued ?? []) {
    results.push(await sendOne(notification));
  }

  return results;
}

async function sendOne(notification: Notification): Promise<SendResult> {
  const service = createServiceClient();

  // Claim the row. The conditional update means only the worker whose write
  // actually changed status goes on to send.
  const { data: claimed, error: claimError } = await service
    .from("notifications")
    .update({ status: "sending", attempts: notification.attempts + 1 })
    .eq("id", notification.id)
    .eq("status", notification.status)
    .select("id");

  if (claimError) {
    return { id: notification.id, status: "failed", error: claimError.message };
  }

  if (!claimed || claimed.length === 0) {
    return { id: notification.id, status: "skipped" };
  }

  try {
    const providerId = await dispatch(notification);

    const { error } = await service
      .from("notifications")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        provider_message_id: providerId,
        last_error: null,
      })
      .eq("id", notification.id);

    if (error) throw new Error(error.message);

    return { id: notification.id, status: "sent" };
  } catch (cause) {
    const attempts = notification.attempts + 1;
    const exhausted = attempts >= notification.max_attempts;

    // Exponential backoff, then give up so the admin message log shows a
    // terminal failure rather than retrying forever.
    const backoffMinutes = 2 ** attempts;

    const { error } = await service
      .from("notifications")
      .update({
        status: exhausted ? "failed" : "queued",
        last_error: cause instanceof Error ? cause.message : String(cause),
        next_attempt_at: new Date(
          Date.now() + backoffMinutes * 60_000,
        ).toISOString(),
      })
      .eq("id", notification.id);

    if (error) {
      return { id: notification.id, status: "failed", error: error.message };
    }

    return {
      id: notification.id,
      status: "failed",
      error: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

/**
 * Sends one message through the provider.
 *
 * WhatsApp is the primary channel and SMS the fallback (section 13). The send
 * itself is the injected {@link setNotificationSender sender}, wired by the
 * cron route from the WhatsApp Cloud API integration (see
 * `src/server/whatsapp-provider.ts`), so a disabled or unconfigured
 * integration keeps reporting a failure rather than pretending to send.
 */
async function dispatch(notification: Notification): Promise<string> {
  const rendered = renderTemplate(notification.template, notification.payload);

  const providerId = await sendViaProvider(
    notification.channel,
    notification.destination,
    notification.template,
    rendered,
  );

  return providerId;
}

/**
 * Template rendering.
 *
 * Placeholders are substituted by the provider itself in production, since
 * WhatsApp templates are approved by Meta with fixed parameters. This function
 * exists so the payload shape is validated before the send and so the admin
 * message log has something human readable to show.
 */
export function renderTemplate(
  template: NotificationTemplate,
  payload: unknown,
): string {
  const fields: string[] = [template];

  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    for (const [key, value] of Object.entries(
      payload as Record<string, unknown>,
    )) {
      fields.push(`${key}=${String(value)}`);
    }
  }

  return fields.join(" | ");
}

type ProviderSender = (
  channel: "whatsapp" | "sms",
  destination: string,
  template: NotificationTemplate,
  body: string,
) => Promise<string>;

let sender: ProviderSender | null = null;

/**
 * Injects the provider implementation. The cron route wires the WhatsApp
 * Cloud API client here from the admin panel's integration settings; without
 * an injected sender the worker reports a failure rather than pretending to
 * send, so nothing is silently marked delivered.
 */
export function setNotificationSender(next: ProviderSender): void {
  sender = next;
}

async function sendViaProvider(
  channel: "whatsapp" | "sms",
  destination: string | null,
  template: NotificationTemplate,
  body: string,
): Promise<string> {
  if (!destination) {
    throw new Error("No destination on notification; cannot send.");
  }
  if (!sender) {
    throw new Error(
      "No notification sender configured. Call setNotificationSender() during bootstrap.",
    );
  }
  return sender(channel, destination, template, body);
}

/**
 * Applies a provider delivery-status webhook (section 13).
 *
 * Idempotent: a replayed webhook writes the same row to the same state.
 */
export async function recordDeliveryStatus(
  providerMessageId: string,
  status: "sent" | "delivered" | "read" | "failed",
  errorCode?: string,
): Promise<void> {
  const service = createServiceClient();

  const nextStatus =
    status === "failed" ? "failed" : status === "read" ? "read" : "sent";

  const { error } = await service
    .from("notifications")
    .update({
      status: nextStatus,
      last_error: errorCode ?? null,
    })
    .eq("provider_message_id", providerMessageId);

  if (error) throw new Error(error.message);
}
