/**
 * Invoice arithmetic.
 *
 * Kept apart from `src/server/billing.ts` on purpose: that module opens a
 * Supabase client, so it cannot be imported by a plain test. This is the half
 * of billing that is pure arithmetic over the submitted line-up — and the half
 * most worth testing, because it is where a bill's totals are decided.
 */

/** A billing write that failed for a reason worth showing to the admin. */
export class BillingError extends Error {
  constructor(
    message: string,
    readonly userMessage: string,
  ) {
    super(message);
    this.name = "BillingError";
  }
}

/** The invoice total, floored at zero so a discount cannot make it negative. */
export function invoiceTotal(input: {
  subtotal: number;
  tax: number;
  deliveryCharge: number;
  discount: number;
}): number {
  return Math.max(
    0,
    input.subtotal + input.tax + input.deliveryCharge - input.discount,
  );
}

/** The store's delivery rule, as plain numbers: free at or above, flat below. */
export type DeliveryPolicy = { freeAboveInr: number; chargeInr: number };

/**
 * The delivery charge for a services subtotal.
 *
 * The store's policy is a single rule — free delivery at or above a threshold,
 * one flat charge below it — and both the server (which bills) and the admin
 * form (which displays the figure it will become) must read it from here rather
 * than restating it, so changing the rule in one place cannot desync the other.
 */
export function deliveryChargeFor(
  subtotal: number,
  policy: DeliveryPolicy,
): number {
  return subtotal >= policy.freeAboveInr ? 0 : policy.chargeInr;
}
