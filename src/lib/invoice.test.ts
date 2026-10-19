import { describe, expect, it } from "vitest";

import { BillingError, invoiceTotal, priceInvoiceLines } from "./invoice";

/**
 * The catalogue is the billing authority, so these tests are about a line's
 * price and name coming from it and only from it.
 */

const CATALOGUE = [
  { id: "svc-wash", name: "Wash and Fold", price: 60, is_active: true },
  { id: "svc-dry", name: "Dry Cleaning", price: 250.5, is_active: true },
  { id: "svc-old", name: "Retired Service", price: 99, is_active: false },
];

describe("priceInvoiceLines", () => {
  it("names and prices every line from the catalogue", () => {
    const { lines, subtotal } = priceInvoiceLines(
      "order-1",
      [
        { serviceId: "svc-wash", qty: 4 },
        { serviceId: "svc-dry", qty: 2, notes: "Silk only" },
      ],
      CATALOGUE,
    );

    expect(lines[0]).toMatchObject({
      order_id: "order-1",
      service_id: "svc-wash",
      item_name: "Wash and Fold",
      qty: 4,
      unit_price: 60,
      notes: null,
      photo_url: null,
    });
    expect(lines[1]).toMatchObject({ unit_price: 250.5, notes: "Silk only" });
    expect(subtotal).toBe(4 * 60 + 2 * 250.5);
  });

  it("refuses a service that is not on the catalogue", () => {
    expect(() =>
      priceInvoiceLines("order-1", [{ serviceId: "nope", qty: 1 }], CATALOGUE),
    ).toThrow(BillingError);
  });

  it("refuses a retired service rather than billing it", () => {
    expect(() =>
      priceInvoiceLines("order-1", [{ serviceId: "svc-old", qty: 1 }], CATALOGUE),
    ).toThrow(/retired/);
  });
});

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
