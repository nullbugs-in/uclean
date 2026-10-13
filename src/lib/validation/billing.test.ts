import { describe, expect, it } from "vitest";

import { codSchema, invoiceSchema, orderItemSchema } from "./billing";
import { bookPickupSchema, mobileSchema } from "./index";

describe("orderItemSchema", () => {
  it("accepts a normal line item", () => {
    const parsed = orderItemSchema.safeParse({
      serviceId: "0f9a3b2c-1d4e-4f6a-8b9c-0d1e2f3a4b5c",
      itemName: "Cotton shirts",
      qty: "4",
      unitPrice: "60.00",
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects a zero or negative quantity", () => {
    expect(
      orderItemSchema.safeParse({ itemName: "Shirt", qty: 0, unitPrice: 60 })
        .success,
    ).toBe(false);
    expect(
      orderItemSchema.safeParse({ itemName: "Shirt", qty: -1, unitPrice: 60 })
        .success,
    ).toBe(false);
  });

  it("rejects a negative unit price", () => {
    expect(
      orderItemSchema.safeParse({ itemName: "Shirt", qty: 1, unitPrice: -10 })
        .success,
    ).toBe(false);
  });
});

describe("invoiceSchema", () => {
  const base = {
    orderId: "0f9a3b2c-1d4e-4f6a-8b9c-0d1e2f3a4b5c",
    subtotal: 240,
    tax: 0,
    discount: 0,
    deliveryCharge: 0,
  };

  it("requires at least one item", () => {
    expect(invoiceSchema.safeParse({ ...base, items: [] }).success).toBe(false);
  });

  it("accepts an invoice with one item", () => {
    const parsed = invoiceSchema.safeParse({
      ...base,
      items: [{ itemName: "Shirts", qty: 4, unitPrice: 60 }],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a discount larger than nothing to discount", () => {
    // The schema cannot know the subtotal, but it must at least reject a
    // negative discount, which would otherwise inflate the total.
    expect(
      invoiceSchema.safeParse({
        ...base,
        discount: -100,
        items: [{ itemName: "S", qty: 1, unitPrice: 1 }],
      }).success,
    ).toBe(false);
  });
});

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
