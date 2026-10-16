import { describe, expect, it } from "vitest";

import { storeSettingsSchema } from "./store";

/**
 * Guards the payloads the admin Settings form submits.
 *
 * The coordinates here are the point the 6 km delivery check measures from, so
 * a bad one is not cosmetic: it silently changes who can book. The pair rule and
 * the range rule are the two that matter.
 */

const base = {
  lat: 12.3248091,
  lng: 76.6288967,
  maxRadiusKm: 6,
  address: "Shop 1, Main Rd",
  whatsappNumber: "918073974160",
  gstin: "29ABCDE1234F1Z5",
};

describe("storeSettingsSchema", () => {
  it("accepts a complete, well-formed payload", () => {
    const parsed = storeSettingsSchema.safeParse(base);

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.lat).toBe(12.3248091);
      expect(parsed.data.gstin).toBe("29ABCDE1234F1Z5");
    }
  });

  it("accepts cleared coordinates and blank optionals", () => {
    const parsed = storeSettingsSchema.safeParse({
      lat: null,
      lng: null,
      maxRadiusKm: 6,
      address: "   ",
      whatsappNumber: null,
      gstin: null,
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      // The soft fields are trimmed, so "   " is stored as "" rather than kept.
      expect(parsed.data.address).toBe("");
      expect(parsed.data.lat).toBeNull();
    }
  });

  it("rejects a latitude outside the valid range", () => {
    const parsed = storeSettingsSchema.safeParse({ ...base, lat: 120 });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toMatch(/between -90 and 90/);
    }
  });

  it("rejects a longitude outside the valid range", () => {
    const parsed = storeSettingsSchema.safeParse({ ...base, lng: 999 });

    expect(parsed.success).toBe(false);
  });

  it("rejects half a coordinate pair", () => {
    const parsed = storeSettingsSchema.safeParse({ ...base, lng: null });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.path).toEqual(["lat"]);
      expect(parsed.error.issues[0]?.message).toMatch(/both the latitude/);
    }
  });

  it("rejects a radius that is not a number, zero, or absurdly large", () => {
    for (const maxRadiusKm of [Number.NaN, 0, -3, 500]) {
      expect(
        storeSettingsSchema.safeParse({ ...base, maxRadiusKm }).success,
      ).toBe(false);
    }
  });

  it("rejects a malformed GSTIN and accepts a blank one", () => {
    expect(
      storeSettingsSchema.safeParse({ ...base, gstin: "not-a-gstin" }).success,
    ).toBe(false);

    expect(storeSettingsSchema.safeParse({ ...base, gstin: "" }).success).toBe(
      true,
    );
  });
});
