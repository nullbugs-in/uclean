import "server-only";

import type {
  NotificationTemplate,
  WhatsAppTemplateConfig,
  WhatsAppTemplateMapping,
} from "@/db/types";

/**
 * The WhatsApp Cloud API client (section 13, "Milestone 6").
 *
 * This is the implementation the notification queue's provider seam has been
 * waiting for: business notifications are sent as Meta-approved templates,
 * resolved from the admin panel's mapping in `whatsapp_settings` (migration
 * 23). Nothing here is queued or retried - the queue worker already claims,
 * backs off and records states; this module only does the HTTP call.
 *
 * House rules observed throughout: plain `fetch` rather than an SDK, and the
 * access token is read from the server environment at the moment it is used.
 * It is never stored, logged, audited or echoed back, so "never display the
 * full token again" holds trivially - the panel can report only whether the
 * credentials are present.
 */

type ProviderSender = (
  channel: "whatsapp" | "sms",
  destination: string,
  template: NotificationTemplate,
  body: string,
) => Promise<string>;

export type WhatsAppCredentials = {
  phoneNumberId: string;
  accessToken: string;
};

/**
 * Reads the Cloud API credentials from the environment. Both parts are
 * required, because a token without its phone number id cannot send and an id
 * without a token cannot authenticate. `null` means "not configured", which
 * the UI reports as a warning rather than a failure.
 */
export function whatsappCredentialsFromEnv(): WhatsAppCredentials | null {
  const phoneNumberId = process.env["WHATSAPP_PHONE_NUMBER_ID"];
  const accessToken = process.env["WHATSAPP_ACCESS_TOKEN"];

  if (!phoneNumberId || !accessToken) return null;

  return { phoneNumberId, accessToken };
}

/** Error fragments Meta puts in a failed call's body, when it puts any. */
type GraphErrorBody = {
  error?: { message?: string } | null;
};

type GraphSuccessBody = {
  messages?: Array<{ id?: string }> | null;
};

/**
 * Sends one Meta-approved template to one destination.
 *
 * `to` must be Meta's international digit format (country code first, no plus
 * sign), so any punctuation the destination carried is stripped here rather
 * than by each caller.
 *
 * The outcome is a discriminated result rather than a throw: the caller (the
 * test-message action) records the difference on the settings row, and a
 * failed test must be shippable information, not an edge crash.
 */
export async function sendWhatsAppTemplate(
  credentials: WhatsAppCredentials,
  destination: string,
  template: WhatsAppTemplateConfig,
): Promise<
  { ok: true; providerMessageId: string } | { ok: false; error: string }
> {
  // Pinned: Cloud API versions are additive, so a fixed version is what a
  // template payload shape has been verified against.
  const GRAPH_VERSION = "v21.0";
  const to = destination.replace(/[^0-9]/g, "");

  try {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${credentials.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "template",
          template: {
            name: template.name,
            language: { code: template.language },
          },
        }),
      },
    );

    if (!response.ok) {
      const failure = (await response
        .json()
        .catch(() => null)) as GraphErrorBody | null;

      return {
        ok: false,
        error:
          failure?.error?.message ??
          `WhatsApp Cloud API returned HTTP ${response.status}.`,
      };
    }

    const success = (await response
      .json()
      .catch(() => null)) as GraphSuccessBody | null;

    const providerMessageId = success?.messages?.[0]?.id;
    if (typeof providerMessageId !== "string") {
      return {
        ok: false,
        error: "WhatsApp Cloud API accepted the message but returned no id.",
      };
    }

    return { ok: true, providerMessageId };
  } catch (cause) {
    return {
      ok: false,
      error:
        cause instanceof Error ? cause.message : "Could not reach WhatsApp.",
    };
  }
}

/**
 * Builds the sender the notification queue's seam injects.
 *
 * The mapping is captured when the cron worker bootstraps the sender, so one
 * queue pass resolves every template against one settings read. An unmapped
 * template refuses to send with a message the admin log can act on - sending
 * a made-up template name would burn a queue attempt on a failure Meta would
 * reject anyway.
 */
export function makeCloudApiSender(
  credentials: WhatsAppCredentials,
  mapping: WhatsAppTemplateMapping,
): ProviderSender {
  return async (channel, destination, template) => {
    if (channel !== "whatsapp") {
      throw new Error(
        "The WhatsApp Cloud API integration sends WhatsApp only.",
      );
    }

    const config = mapping[template] as WhatsAppTemplateConfig | undefined;
    if (!config?.name) {
      throw new Error(
        `Template ${template} is not mapped to an approved Meta template name. Map it in Settings.`,
      );
    }

    const outcome = await sendWhatsAppTemplate(credentials, destination, {
      name: config.name,
      // An entry whose language is somehow empty falls back to Meta's default
      // language rather than sending an invalid empty field.
      language: config.language || "en",
    });

    if (!outcome.ok) {
      throw new Error(outcome.error);
    }

    return outcome.providerMessageId;
  };
}
