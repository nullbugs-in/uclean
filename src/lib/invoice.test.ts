import { describe, expect, it } from "vitest";

import { deliveryChargeFor, invoiceTotal } from "./invoice";

describe("invoiceTotal", () => {
  it("adds tax and delivery and subtracts the discount", () => {
    expect(
      invoiceTotal({
        subtotal: 100,
        tax: 18,
        deliveryCharge: 20,
        discount: 10,
      }),
    ).toBe(128);
  });

  it("floors at zero, so a big discount cannot go negative", () => {
    expect(
      invoiceTotal({
        subtotal: 100,
        tax: 0,
        deliveryCharge: 0,
        discount: 500,
      }),
    ).toBe(0);
  });
});

describe("deliveryChargeFor", () => {
  const POLICY = { freeAboveInr: 999, chargeInr: 69 };

  it("is free at the threshold", () => {
    expect(deliveryChargeFor(999, POLICY)).toBe(0);
    expect(deliveryChargeFor(1000, POLICY)).toBe(0);
  });

  it("is the flat charge below the threshold", () => {
    expect(deliveryChargeFor(998.99, POLICY)).toBe(69);
    expect(deliveryChargeFor(0, POLICY)).toBe(69);
  });
});
