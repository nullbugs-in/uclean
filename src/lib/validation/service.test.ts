import { describe, expect, it } from "vitest";

import { serviceSchema } from "./service";

/**
 * Guards the payloads the admin Services page submits.
 *
 * This is the catalogue invoices price from, so the rules that matter are the
 * ones that keep a bad price out: negative, non-numeric or NaN. A price of 0 is
 * deliberately valid -- that is a free or promotional line, not a mistake.
 */

const base = {
  name: "Dry Cleaning",
  description: "Specialist dry cleaning for delicate fabrics",
  unit: "piece",
  price: 250,
  imageUrl: null,
  isActive: true,
  sortOrder: 3,
};

describe("serviceSchema", () => {
  it("accepts a well-formed service", () => {
    const parsed = serviceSchema.safeParse(base);

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.price).toBe(250);
  });

  it("accepts a price of 0, trimmed strings and blank optionals", () => {
    const parsed = serviceSchema.safeParse({
      ...base,
      name: "  Dry Cleaning  ",
      price: 0,
      description: null,
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.name).toBe("Dry Cleaning");
      expect(parsed.data.price).toBe(0);
    }
  });

  it("coerces a numeric string, as a form field sends", () => {
    const parsed = serviceSchema.safeParse({ ...base, price: "120.5" });

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.price).toBe(120.5);
  });

  it("rejects a negative, non-numeric or NaN price", () => {
    for (const price of [-1, "abc", Number.NaN, 1000000]) {
      expect(serviceSchema.safeParse({ ...base, price }).success).toBe(false);
    }
  });

  it("rejects a blank name or unit", () => {
    expect(serviceSchema.safeParse({ ...base, name: "   " }).success).toBe(
      false,
    );
    expect(serviceSchema.safeParse({ ...base, unit: "" }).success).toBe(false);
  });

  it("rejects a fractional sort order", () => {
    expect(serviceSchema.safeParse({ ...base, sortOrder: 2.5 }).success).toBe(
      false,
    );
  });
});
