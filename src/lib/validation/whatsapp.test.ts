import { describe, expect, it } from "vitest";

import { whatsappSettingsSchema, whatsappTestSchema } from "./whatsapp";

/**
 * The WhatsApp schemas.
 *
 * The rules worth pinning are the ones Meta itself enforces and the ones that
 * would otherwise fail three weeks later in a provider log: template names may
 * only contain lowercase letters, numbers and underscores; language codes look
 * like "en" or "en_US"; a destination is Meta's international digit format.
 * And a mapping with only some templates filled in is valid - unmapped
 * templates are "not approved yet", not an error.
 */
describe("whatsappSettingsSchema", () => {
  const base = {
    enabled: false,
    templateMapping: {
      order_confirmed: { name: "uclean_pickup_confirmed", language: "en_US" },
    },
  };

  it("accepts a mapping that names only some templates", () => {
    const parsed = whatsappSettingsSchema.safeParse(base);

    expect(parsed.success).toBe(true);
  });

  it("accepts an empty mapping, which is the untouched integration", () => {
    const parsed = whatsappSettingsSchema.safeParse({
      enabled: false,
      templateMapping: {},
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects Meta-illegal template names", () => {
    const parsed = whatsappSettingsSchema.safeParse({
      ...base,
      templateMapping: {
        order_confirmed: { name: "Pickup-Confirmed", language: "en" },
      },
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects bare template names", () => {
    const parsed = whatsappSettingsSchema.safeParse({
      ...base,
      templateMapping: {
        delivered: { name: "", language: "en" },
      },
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects implausible language codes", () => {
    const parsed = whatsappSettingsSchema.safeParse({
      ...base,
      templateMapping: {
        delivered: { name: "uclean_delivered", language: "e" },
      },
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects a template key the app does not queue", () => {
    const parsed = whatsappSettingsSchema.safeParse({
      enabled: false,
      templateMapping: {
        welcome_message: { name: "uclean_welcome", language: "en" },
      },
    });

    expect(parsed.success).toBe(false);
  });
});

describe("whatsappTestSchema", () => {
  it("normalises the destination to Meta's digit format", () => {
    const parsed = whatsappTestSchema.safeParse({
      destination: "+91 98450 12345",
      template: "order_confirmed",
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.destination).toBe("919845012345");
    }
  });

  it("requires a full international number", () => {
    const parsed = whatsappTestSchema.safeParse({
      destination: "98450",
      template: "order_confirmed",
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects an internal template that would leak nothing", () => {
    // "otp" exists here as a template the admin may send; no made-up values.
    const parsed = whatsappTestSchema.safeParse({
      destination: "919845012345",
      template: "broadcast",
    });

    expect(parsed.success).toBe(false);
  });
});
