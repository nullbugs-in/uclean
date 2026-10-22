import { describe, expect, it } from "vitest";

import { codSchema } from "./billing";
import { bookPickupSchema, mobileSchema } from "./index";

describe("codSchema", () => {
  it("requires a positive amount", () => {
    expect(
      codSchema.safeParse({
        invoiceId: "0f9a3b2c-1d4e-4f6a-8b9c-0d1e2f3a4b5c",
        amount: 0,
      }).success,
    ).toBe(false);
  });
});

describe("bookPickupSchema", () => {
  it("does not accept a client supplied distance", () => {
    const parsed = bookPickupSchema.safeParse({
      address: "12 MG Road, Indiranagar, Bengaluru",
      lat: 12.97,
      lng: 77.64,
      slotDate: "2026-01-15",
      slotId: "0f9a3b2c-1d4e-4f6a-8b9c-0d1e2f3a4b5c",
      zoneNoticeAcceptedAt: new Date().toISOString(),
      distanceKm: 0,
    });

    // Zod strips unknown keys by default, so a forged distance is dropped
    // rather than forwarded. The real defence is that the server recomputes it.
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).not.toHaveProperty("distanceKm");
    }
  });

  it("requires the zone notice acceptance timestamp", () => {
    const parsed = bookPickupSchema.safeParse({
      address: "12 MG Road, Indiranagar, Bengaluru",
      lat: 12.97,
      lng: 77.64,
      slotDate: "2026-01-15",
      slotId: "0f9a3b2c-1d4e-4f6a-8b9c-0d1e2f3a4b5c",
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects coordinates outside valid ranges", () => {
    expect(
      bookPickupSchema.safeParse({
        address: "12 MG Road, Indiranagar, Bengaluru",
        lat: 120,
        lng: 77.64,
        slotDate: "2026-01-15",
        slotId: "0f9a3b2c-1d4e-4f6a-8b9c-0d1e2f3a4b5c",
        zoneNoticeAcceptedAt: new Date().toISOString(),
      }).success,
    ).toBe(false);
  });
});

describe("mobileSchema", () => {
  it("accepts an E.164 mobile with a country code", () => {
    expect(mobileSchema.safeParse("+919876543210").success).toBe(true);
  });

  it("accepts a bare 10 digit Indian mobile", () => {
    expect(mobileSchema.safeParse("9876543210").success).toBe(true);
  });

  it("rejects letters and short numbers", () => {
    expect(mobileSchema.safeParse("98765").success).toBe(false);
    expect(mobileSchema.safeParse("+91abcdefghij").success).toBe(false);
    expect(mobileSchema.safeParse("").success).toBe(false);
  });
});
