import { siteConfig } from "@/config/site";

/**
 * Pickup and delivery charge on a customer booking.
 *
 * Free on orders at or above the threshold, a flat charge below it. The two
 * numbers come from `siteConfig.deliveryPolicy` so the price list, the booking
 * wizard and `src/server/billing.ts` all quote the same figure.
 *
 * This is a display-only quote: it is shown on the services, review and
 * confirmation screens, and is deliberately not persisted on the order. The
 * charge actually billed is computed server side from the assessed draft.
 */

export type DeliveryQuote = {
  /** What the chosen services come to before delivery. */
  subtotal: number;
  /** 0 when the order ships free, otherwise the flat charge. */
  charge: number;
  /** subtotal + charge, the figure quoted to the customer. */
  total: number;
  isFree: boolean;
  /** Order value at or above which delivery is free. */
  freeAboveInr: number;
  /** Flat charge applied below the threshold. */
  chargeInr: number;
  /**
   * How much more the customer could add to reach free delivery, or null when
   * the threshold is already met. Zero for an empty selection so the wizard
   * does not nudge before anything has been picked.
   */
  amountToFree: number | null;
};

export const FREE_DELIVERY_ABOVE_INR = siteConfig.deliveryPolicy.freeAboveInr;
export const DELIVERY_CHARGE_INR = siteConfig.deliveryPolicy.chargeInr;

/**
 * Quotes the delivery charge for a service subtotal.
 *
 * An empty selection quotes nothing: charging 69 rupees on a cart with nothing
 * in it would read as a mistake rather than a policy.
 */
export function quoteDelivery(subtotal: number): DeliveryQuote {
  const amount = Math.max(0, subtotal);
  const hasServices = amount > 0;
  const isFree = !hasServices || amount >= FREE_DELIVERY_ABOVE_INR;
  const charge = isFree ? 0 : DELIVERY_CHARGE_INR;

  return {
    subtotal: amount,
    charge,
    total: amount + charge,
    isFree,
    freeAboveInr: FREE_DELIVERY_ABOVE_INR,
    chargeInr: DELIVERY_CHARGE_INR,
    amountToFree: isFree ? null : FREE_DELIVERY_ABOVE_INR - amount,
  };
}
