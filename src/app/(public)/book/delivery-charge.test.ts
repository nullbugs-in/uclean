import { describe, expect, it } from "vitest";

import {
  DELIVERY_CHARGE_INR,
  FREE_DELIVERY_ABOVE_INR,
  quoteDelivery,
} from "./delivery-charge";

describe("quoteDelivery", () => {
  it("charges nothing on an empty selection", () => {
    const quote = quoteDelivery(0);

    expect(quote.charge).toBe(0);
    expect(quote.total).toBe(0);
    expect(quote.isFree).toBe(true);
    expect(quote.amountToFree).toBeNull();
  });

  it("adds the flat charge below the threshold", () => {
    const quote = quoteDelivery(250);

    expect(quote.charge).toBe(DELIVERY_CHARGE_INR);
    expect(quote.total).toBe(250 + DELIVERY_CHARGE_INR);
    expect(quote.isFree).toBe(false);
    expect(quote.amountToFree).toBe(FREE_DELIVERY_ABOVE_INR - 250);
  });

  it("is free exactly at the threshold", () => {
    const quote = quoteDelivery(FREE_DELIVERY_ABOVE_INR);

    expect(quote.isFree).toBe(true);
    expect(quote.charge).toBe(0);
    expect(quote.total).toBe(FREE_DELIVERY_ABOVE_INR);
    expect(quote.amountToFree).toBeNull();
  });

  it("is free above the threshold", () => {
    const quote = quoteDelivery(FREE_DELIVERY_ABOVE_INR + 0.01);

    expect(quote.charge).toBe(0);
    expect(quote.total).toBe(quote.subtotal);
    expect(quote.amountToFree).toBeNull();
  });

  it("charges one rupee under the threshold", () => {
    const quote = quoteDelivery(FREE_DELIVERY_ABOVE_INR - 1);

    expect(quote.isFree).toBe(false);
    expect(quote.charge).toBe(DELIVERY_CHARGE_INR);
    expect(quote.amountToFree).toBe(1);
  });

  it("treats a negative subtotal as empty", () => {
    const quote = quoteDelivery(-500);

    expect(quote.subtotal).toBe(0);
    expect(quote.charge).toBe(0);
    expect(quote.total).toBe(0);
  });
});
