import { describe, expect, it } from "vitest";

import { pickupRequestSchema } from "./booking";

/**
 * Guards the service lines the booking wizard sends.
 *
 * The names and prices come from the client, so this is the only place a
 * malformed line is caught before it reaches order_items.
 */

const base = {
  address: "2979/1, D21/1, 6th Main Rd",
  lat: 12.32,
  lng: 76.62,
  slotDate: "2026-10-20",
  slotId: "53048928-73d0-4f56-be1d-d403a8201752",
  zoneNoticeAcceptedAt: new Date().toISOString(),
};

describe("pickupRequestSchema service items", () => {
  it("accepts a booking with services", () => {
    const parsed = pickupRequestSchema.safeParse({
      ...base,
      items: [
        { name: "Wash & Fold", qty: 2, unitPrice: 89 },
        { name: "Dry Cleaning (Blouse)", qty: 1, unitPrice: 49 },
      ],
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects a line with no name, and one with a non-positive quantity", () => {
    expect(
      pickupRequestSchema.safeParse({
        ...base,
        items: [{ name: "   ", qty: 1, unitPrice: 89 }],
      }).success,
    ).toBe(false);

    expect(
      pickupRequestSchema.safeParse({
        ...base,
        items: [{ name: "Wash & Fold", qty: 0, unitPrice: 89 }],
      }).success,
    ).toBe(false);
  });

  it("rejects a negative price and an oversized payload", () => {
    expect(
      pickupRequestSchema.safeParse({
        ...base,
        items: [{ name: "Wash & Fold", qty: 1, unitPrice: -1 }],
      }).success,
    ).toBe(false);

    expect(
      pickupRequestSchema.safeParse({
        ...base,
        items: Array.from({ length: 31 }, () => ({
          name: "Wash & Fold",
          qty: 1,
          unitPrice: 89,
        })),
      }).success,
    ).toBe(false);
  });
});
