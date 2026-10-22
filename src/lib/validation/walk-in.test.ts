import { describe, expect, it } from "vitest";

import {
  walkInCustomerSchema,
  walkInLookupSchema,
  walkInRequestSchema,
} from "./walk-in";

/**
 * Guards the walk-in submit.
 *
 * A walk-in is verified the same way an online booking is, with two additions
 * the counter introduces: the customer's name and number, and a basket that
 * cannot be empty when submitted. The name is the one field that gets discarded
 * when the number already belongs to a customer, so the schema's only job here
 * is to make sure something usable arrives.
 */

const slotUuid = "53048928-73d0-4f56-be1d-d403a8201752";

const base = {
  fullName: "Asha Menon",
  mobile: "9876543210",
  address: "2979/1, D21/1, 6th Main Rd",
  lat: 12.32,
  lng: 76.62,
  slotDate: "2026-10-20",
  slotId: slotUuid,
  zoneNoticeAcceptedAt: new Date().toISOString(),
  items: [{ name: "Wash & Fold", qty: 2, unitPrice: 89 }],
};

describe("walkInCustomerSchema", () => {
  it("canonicalises the mobile and trims the name", () => {
    const parsed = walkInCustomerSchema.parse({
      fullName: "  Asha Menon  ",
      mobile: "98765 43210",
    });

    expect(parsed).toEqual({
      fullName: "Asha Menon",
      mobile: "+919876543210",
    });
  });

  it("refuses a name too short to put on a receipt", () => {
    expect(
      walkInCustomerSchema.safeParse({ fullName: "A", mobile: "9876543210" })
        .success,
    ).toBe(false);
  });

  it("refuses a number that is not a mobile", () => {
    expect(
      walkInCustomerSchema.safeParse({ fullName: "Asha", mobile: "12345" })
        .success,
    ).toBe(false);
  });
});

describe("walkInLookupSchema", () => {
  it("canonicalises the number being looked up", () => {
    expect(walkInLookupSchema.parse({ mobile: "09876543210" })).toEqual({
      mobile: "+919876543210",
    });
  });
});

describe("walkInRequestSchema", () => {
  it("accepts a counter order", () => {
    expect(walkInRequestSchema.safeParse(base).success).toBe(true);
  });

  /**
   * The wizard tolerates an empty basket because a customer may be browsing.
   * A walk-in does not: staff have just been told what the customer wants, and an
   * order with no lines is an invoice nobody can write.
   */
  it("insists on at least one service, unlike the online wizard", () => {
    expect(walkInRequestSchema.safeParse({ ...base, items: [] }).success).toBe(
      false,
    );
  });

  it("takes the wizard's line shape, with no catalogue reference", () => {
    expect(
      walkInRequestSchema.safeParse({
        ...base,
        items: [{ name: "Wash & Fold", qty: 2, unitPrice: 89 }],
      }).success,
    ).toBe(true);

    expect(
      walkInRequestSchema.safeParse({
        ...base,
        items: [{ name: "", qty: 2, unitPrice: 89 }],
      }).success,
    ).toBe(false);

    expect(
      walkInRequestSchema.safeParse({
        ...base,
        items: [{ name: "Wash & Fold", qty: 2 }],
      }).success,
    ).toBe(false);
  });

  it("still enforces the slot date and the zone notice", () => {
    expect(
      walkInRequestSchema.safeParse({ ...base, slotDate: "20-10-2026" }).success,
    ).toBe(false);

    expect(
      walkInRequestSchema.safeParse({
        ...base,
        zoneNoticeAcceptedAt: "not-a-timestamp",
      }).success,
    ).toBe(false);
  });
});
