import "server-only";

import type { WhatsAppSettings } from "@/db/types";

/**
 * The WhatsApp integration status, derived for the Settings page badge.
 *
 * "Is it working" is not one fact, so it is three: whether the Cloud API
 * credentials exist in the server environment, whether the admin's switch is
 * on, and whether the last real test message actually went through. The last
 * one dominates, because an enabled integration whose test failed is reported
 * as failed rather than as active - a badge that says "active" over a failing
 * send would be the one row the admin never checks.
 */
export type WhatsAppStatus = {
  variant: "success" | "warning" | "secondary";
  label: string;
  /** Why, in one line; shown under the badge. */
  detail: string | null;
};

export function whatsappIntegrationStatus(
  settings: WhatsAppSettings | null,
  credentialsConfigured: boolean,
): WhatsAppStatus {
  if (!credentialsConfigured) {
    return {
      variant: "warning",
      label: "Not connected",
      detail:
        "Cloud API credentials are missing on the server; nothing can send.",
    };
  }

  if (!settings?.enabled) {
    return {
      variant: "secondary",
      label: "Disabled",
      detail: "Credentials are present; the integration switch is off.",
    };
  }

  if (settings.last_test_ok === false) {
    return {
      variant: "warning",
      label: "Test failed",
      detail: settings.last_test_error ?? "The last test message did not send.",
    };
  }

  if (settings.last_test_ok === null) {
    return {
      variant: "success",
      label: "Active",
      detail: "Enabled. No test message has been sent yet.",
    };
  }

  return {
    variant: "success",
    label: "Active",
    detail: "Enabled, and the last test message went through.",
  };
}
