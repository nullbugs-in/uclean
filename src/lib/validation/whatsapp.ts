import { z } from "zod";

/**
 * WhatsApp Cloud API integration, as the admin Settings form submits it.
 *
 * Separated from the action that consumes it so the rules can be tested
 * without loading `next/cache` and the auth stack (the same split as
 * `store.ts`).
 *
 * Credentials are deliberately absent from this schema: the Cloud API access
 * token and phone number id live in server-side environment variables and are
 * never typed into the panel, so there is nothing here to echo back. What is
 * configured here is the integration switch, the mapping from this app's
 * eight internal templates to Meta-approved template names and languages, and
 * the test message.
 */

const TEMPLATE_NAMES = [
  "otp",
  "order_confirmed",
  "agent_assigned",
  "picked_up",
  "invoice_ready",
  "payment_received",
  "out_for_delivery",
  "delivered",
] as const;

export type WhatsAppTestTemplate = (typeof TEMPLATE_NAMES)[number];

const templateEnum = z.enum(TEMPLATE_NAMES);

export const WHATSAPP_TEMPLATES = TEMPLATE_NAMES;

/**
 * One mapping entry. A Meta-approved template name may only contain
 * lowercase letters, numbers and underscores; the language code is Meta's
 * `en_US`-style identifier.
 */
const templateConfigSchema = z.object({
  name: z
    .string({ invalid_type_error: "Enter the Meta template name" })
    .trim()
    .min(1, "Enter the Meta template name")
    .max(60, "That template name is too long")
    .regex(
      /^[a-z0-9_]+$/,
      "Meta template names use lowercase letters, numbers and underscores",
    ),
  language: z
    .string({ invalid_type_error: "Enter the template language" })
    .trim()
    .min(2, "Enter the template language, for example en or en_US")
    .max(12, "That language code is too long")
    .regex(
      /^[A-Za-z]{2,8}(_[A-Za-z0-9]{2,8})?$/,
      "Use a language code like en or en_US",
    ),
});

/**
 * The settings form: one JSON object whose keys are internal template names
 * and whose entries carry the Meta template to send instead. Unmapped
 * templates simply have no key, which the provider reports as a send failure
 * rather than guessing an approval that Meta never granted.
 */
export const whatsappSettingsSchema = z.object({
  enabled: z.boolean(),
  templateMapping: z.record(templateEnum, templateConfigSchema),
});

/**
 * The test-message form. `whatsapp_settings.last_test_*` stores the outcome,
 * and the destination must be Meta's international digit format: country code
 * first, no plus sign, no zeros.
 */
export const whatsappTestSchema = z.object({
  destination: z
    .string({ invalid_type_error: "Enter a WhatsApp number to send to" })
    .transform((value) => value.replace(/[^0-9]/g, ""))
    .refine(
      (digits) => digits.length >= 10 && digits.length <= 15,
      "Use the full international number with country code, for example 919845012345",
    ),
  template: templateEnum,
});

export type WhatsAppSettingsInput = z.input<typeof whatsappSettingsSchema>;
export type WhatsAppSettingsValues = z.output<typeof whatsappSettingsSchema>;
export type WhatsAppTestInput = z.input<typeof whatsappTestSchema>;
export type WhatsAppTestValues = z.output<typeof whatsappTestSchema>;
