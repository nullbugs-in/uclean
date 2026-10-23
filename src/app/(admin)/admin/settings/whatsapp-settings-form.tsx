"use client";

import { Loader2, Save, Send } from "lucide-react";
import * as React from "react";

import {
  saveWhatsAppSettingsAction,
  sendWhatsAppTestMessageAction,
} from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type {
  NotificationTemplate,
  WhatsAppSettings,
  WhatsAppTemplateConfig,
} from "@/db/types";
import type { WhatsAppTestTemplate } from "@/lib/validation";
import { formatDateTime } from "@/lib/utils";

import type { WhatsAppStatus } from "./whatsapp-status";

/**
 * The eight internal templates, in the order the notification log records
 * them. Labels are the same words the customer bell uses for the same
 * messages, so an admin reading the log and an admin reading this card see
 * one vocabulary.
 */
const TEMPLATES: ReadonlyArray<{
  value: NotificationTemplate;
  label: string;
}> = [
  { value: "otp", label: "Verification code" },
  { value: "order_confirmed", label: "Pickup confirmed" },
  { value: "agent_assigned", label: "Rider assigned" },
  { value: "picked_up", label: "Laundry collected" },
  { value: "invoice_ready", label: "Invoice ready" },
  { value: "payment_received", label: "Payment received" },
  { value: "out_for_delivery", label: "Out for delivery" },
  { value: "delivered", label: "Delivered" },
];

/**
 * Reads the stored mapping. Guarded, because the column is a jsonb blob an
 * earlier mistake could have made interesting; a malformed mapping degrades to
 * empty fields rather than breaking the card.
 */
function mappingOf(
  settings: WhatsAppSettings | null,
): Partial<Record<NotificationTemplate, WhatsAppTemplateConfig>> {
  const value = settings?.template_mapping;
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Partial<Record<NotificationTemplate, WhatsAppTemplateConfig>>;
}

/**
 * The WhatsApp integration form: the connection status, the on/off switch,
 * the template mapping, and the test message.
 *
 * Saving submits everything together (the switch and the mapping describe one
 * configuration), while the test message is its own form on purpose: it is an
 * action against the provider, not a table write, and it records its result
 * whether the mapping was saved this second or yesterday.
 */
export function WhatsAppSettingsForm({
  settings,
  status,
  credentialsConfigured,
}: {
  settings: WhatsAppSettings | null;
  status: WhatsAppStatus;
  credentialsConfigured: boolean;
}) {
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>(
    {},
  );
  const [isPending, startTransition] = React.useTransition();

  const [testError, setTestError] = React.useState<string | null>(null);
  const [testNotice, setTestNotice] = React.useState<string | null>(null);
  const [testPending, startTestTransition] = React.useTransition();
  const [testTemplate, setTestTemplate] =
    React.useState<WhatsAppTestTemplate>("order_confirmed");

  const [enabled, setEnabled] = React.useState(settings?.enabled ?? false);
  const mapping = mappingOf(settings);

  function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setFieldErrors({});

    const data = new FormData(event.currentTarget);

    const templateMapping: Record<string, WhatsAppTemplateConfig> = {};
    for (const { value: template } of TEMPLATES) {
      const name = String(data.get(`meta_name_${template}`) ?? "").trim();
      if (!name) continue;
      const language = String(data.get(`language_${template}`) ?? "").trim();
      templateMapping[template] = { name, language: language || "en" };
    }

    startTransition(async () => {
      const result = await saveWhatsAppSettingsAction({
        enabled,
        templateMapping,
      });

      if (!result.ok) {
        setError(result.message);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }

      setNotice(result.message);
    });
  }

  function handleTest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTestError(null);
    setTestNotice(null);

    const data = new FormData(event.currentTarget);

    const destination = String(data.get("test_destination") ?? "").trim();
    if (!destination) {
      setTestError("Enter the WhatsApp number to send the test message to.");
      return;
    }

    startTestTransition(async () => {
      const result = await sendWhatsAppTestMessageAction({
        destination,
        template: testTemplate,
      });

      if (!result.ok) {
        setTestError(result.message);
        return;
      }

      setTestNotice(result.message);
    });
  }

  const fieldError = (name: string) =>
    fieldErrors[name] ? (
      <p className="text-destructive text-xs">{fieldErrors[name]}</p>
    ) : null;

  return (
    <div className="space-y-6">
      {/*
        Connection status first, because it is the question this card answers:
        the badge plus the one-line reason, and when the last test ran.
      */}
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={status.variant}>{status.label}</Badge>
        <span className="text-muted-foreground text-sm">{status.detail}</span>
      </div>

      {settings?.last_test_at ? (
        <p className="text-muted-foreground text-xs">
          Last test message: {formatDateTime(settings.last_test_at)}
        </p>
      ) : null}

      {/* ------------------------------------------------ save form */}
      <form onSubmit={handleSave} className="space-y-4">
        <div className="flex items-center justify-between gap-4 rounded-xl border px-4 py-3">
          <div className="min-w-0">
            <Label htmlFor="whatsapp-enabled">Activate WhatsApp sending</Label>
            <p className="text-muted-foreground text-xs">
              The notification queue sends customer messages only while this is
              on and the credentials are present.
            </p>
          </div>
          <Switch
            id="whatsapp-enabled"
            checked={enabled}
            onCheckedChange={(next) => setEnabled(Boolean(next))}
            disabled={isPending}
          />
        </div>

        <div className="space-y-3">
          <p className="text-muted-foreground text-sm">
            Template mapping. Each message this app queues is sent as the
            Meta-approved template named here. Leave a template&apos;s name
            empty to keep sending disabled for it.
          </p>

          {TEMPLATES.map(({ value: template, label }) => (
            <div
              key={template}
              className="grid items-end gap-2 rounded-xl border px-4 py-3 sm:grid-cols-[1fr_auto_1fr] sm:gap-3"
            >
              <div className="space-y-1">
                <Label
                  htmlFor={`meta_name_${template}`}
                  className="text-sm font-medium"
                >
                  {label}
                </Label>
                <p className="text-muted-foreground font-mono text-[11px]">
                  {template}
                </p>
              </div>
              <span
                className="text-muted-foreground hidden text-sm sm:block"
                aria-hidden="true"
              >
                →
              </span>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <Label htmlFor={`meta_name_${template}`} className="sr-only">
                    Meta template name
                  </Label>
                  <Input
                    id={`meta_name_${template}`}
                    name={`meta_name_${template}`}
                    defaultValue={mapping[template]?.name ?? ""}
                    placeholder="Meta template name"
                    aria-invalid={Boolean(fieldErrors[template])}
                    disabled={!credentialsConfigured}
                  />
                  {fieldError(template)}
                </div>
                <div>
                  <Label htmlFor={`language_${template}`} className="sr-only">
                    Language
                  </Label>
                  <Input
                    id={`language_${template}`}
                    name={`language_${template}`}
                    defaultValue={mapping[template]?.language ?? "en"}
                    placeholder="en"
                    aria-invalid={Boolean(fieldErrors[template])}
                    disabled={!credentialsConfigured}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={isPending}>
            {isPending ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Save aria-hidden="true" />
            )}
            Save WhatsApp settings
          </Button>

          {/* Feedback sits next to the button that produced it, like the rest
              of the admin panel, rather than in a toast that scrolls away. */}
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}

          {notice ? (
            <p className="text-muted-foreground text-sm" aria-live="polite">
              {notice}
            </p>
          ) : null}
        </div>
      </form>

      {/* ------------------------------------------------ test message */}
      <form
        onSubmit={handleTest}
        className="space-y-3 border-t pt-4"
        aria-label="Send a WhatsApp test message"
      >
        <p className="text-muted-foreground text-sm">
          Send one real message through the Cloud API to prove the whole path:
          credentials, the template Meta has approved, and delivery. The outcome
          is recorded below and in the Notifications message log.
        </p>

        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-44 space-y-2">
            <Label htmlFor="test_template">Template to send</Label>
            <Select
              name="test_template"
              value={testTemplate}
              onValueChange={(next) =>
                setTestTemplate(next as WhatsAppTestTemplate)
              }
              disabled={!credentialsConfigured}
            >
              <SelectTrigger id="test_template">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEMPLATES.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-52 flex-1 space-y-2">
            <Label htmlFor="test_destination">Send to (WhatsApp)</Label>
            <Input
              id="test_destination"
              name="test_destination"
              type="tel"
              inputMode="tel"
              placeholder="919845012345"
              disabled={!credentialsConfigured}
              autoComplete="off"
            />
          </div>

          <Button
            type="submit"
            variant="outline"
            disabled={testPending || !credentialsConfigured}
          >
            {testPending ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Send aria-hidden="true" />
            )}
            Send test message
          </Button>
        </div>

        {testError ? (
          <p role="alert" className="text-destructive text-sm">
            {testError}
          </p>
        ) : null}

        {testNotice ? (
          <p className="text-muted-foreground text-sm" aria-live="polite">
            {testNotice}
          </p>
        ) : null}
      </form>
    </div>
  );
}
