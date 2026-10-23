import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  makeCloudApiSender,
  sendWhatsAppTemplate,
  whatsappCredentialsFromEnv,
} from "./whatsapp-provider";

/**
 * The Cloud API client.
 *
 * `global.fetch` is stubbed, so these assert the exact request the queue will
 * make to Meta - the URL, the bearer header, the digit-only destination and
 * the template payload - plus how success and every failure shape map back
 * into results and errors the queue (and the test action) can record.
 */

const CREDENTIALS = {
  phoneNumberId: "123456789012345",
  accessToken: "token-abc",
};

const fetchStub = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchStub);
  fetchStub.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("whatsappCredentialsFromEnv", () => {
  it("reads both values from the environment", () => {
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", CREDENTIALS.phoneNumberId);
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", CREDENTIALS.accessToken);

    expect(whatsappCredentialsFromEnv()).toEqual(CREDENTIALS);
  });

  it("reports unconfigured when either half is missing", () => {
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", CREDENTIALS.phoneNumberId);
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "");

    expect(whatsappCredentialsFromEnv()).toBeNull();
  });
});

describe("sendWhatsAppTemplate", () => {
  it("posts the template to the phone number id with the bearer token", async () => {
    fetchStub.mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: "wamid.123" }] }),
    });

    const outcome = await sendWhatsAppTemplate(CREDENTIALS, "+91 98450 12345", {
      name: "uclean_pickup_confirmed",
      language: "en_US",
    });

    expect(outcome).toEqual({ ok: true, providerMessageId: "wamid.123" });
    expect(fetchStub).toHaveBeenCalledTimes(1);

    const [url, init] = fetchStub.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `https://graph.facebook.com/v21.0/${CREDENTIALS.phoneNumberId}/messages`,
    );
    expect(init["headers"]).toMatchObject({
      Authorization: `Bearer ${CREDENTIALS.accessToken}`,
    });
    expect(JSON.parse(String(init["body"]))).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      // Meta wants digits only, so the caller may pass a display format.
      to: "919845012345",
      type: "template",
      template: {
        name: "uclean_pickup_confirmed",
        language: { code: "en_US" },
      },
    });
  });

  it("surfaces Meta's error message on a refused send", async () => {
    fetchStub.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: { message: "(#102) Session expired" },
      }),
    });

    const outcome = await sendWhatsAppTemplate(CREDENTIALS, "919845012345", {
      name: "stale",
      language: "en",
    });

    expect(outcome).toEqual({
      ok: false,
      error: "(#102) Session expired",
    });
  });

  it("falls back to the status line when the body is unreadable", async () => {
    fetchStub.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => {
        throw new Error("not json");
      },
    });

    const outcome = await sendWhatsAppTemplate(CREDENTIALS, "919845012345", {
      name: "stale",
      language: "en",
    });

    expect(outcome).toEqual({
      ok: false,
      error: "WhatsApp Cloud API returned HTTP 503.",
    });
  });

  it("refuses a 200 without a message id", async () => {
    fetchStub.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    const outcome = await sendWhatsAppTemplate(CREDENTIALS, "919845012345", {
      name: "ok_but_empty",
      language: "en",
    });

    expect(outcome).toEqual({
      ok: false,
      error: "WhatsApp Cloud API accepted the message but returned no id.",
    });
  });
});

describe("makeCloudApiSender", () => {
  const MAPPING = {
    order_confirmed: { name: "uclean_pickup_confirmed", language: "en_US" },
  };

  function okFetch() {
    fetchStub.mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: "wamid.1" }] }),
    });
  }

  it("sends the mapped meta template and resolves to the provider id", async () => {
    okFetch();
    const send = makeCloudApiSender(CREDENTIALS, MAPPING);

    const providerMessageId = await send(
      "whatsapp",
      "919845012345",
      "order_confirmed",
      "template | order_confirmed",
    );

    expect(providerMessageId).toBe("wamid.1");

    const [, init] = fetchStub.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init["body"])).template["name"]).toBe(
      "uclean_pickup_confirmed",
    );
  });

  it("refuses a template the admin never mapped", async () => {
    const send = makeCloudApiSender(CREDENTIALS, MAPPING);

    await expect(
      send("whatsapp", "919845012345", "delivered", "template | delivered"),
    ).rejects.toThrow(/not mapped to an approved Meta template/);

    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("refuses non-WhatsApp channels outright", async () => {
    const send = makeCloudApiSender(CREDENTIALS, MAPPING);

    await expect(
      send("sms", "919845012345", "order_confirmed", "sms body"),
    ).rejects.toThrow(/sends WhatsApp only/);

    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("raises the mapped send failure as the queue expects", async () => {
    // The queue worker turns everything thrown into a failed attempt with that
    // message, which is what the admin log will show.
    fetchStub.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: { message: "Template not approved" } }),
    });

    const send = makeCloudApiSender(CREDENTIALS, MAPPING);

    await expect(
      send("whatsapp", "919845012345", "order_confirmed", "body"),
    ).rejects.toThrow("Template not approved");
  });
});
