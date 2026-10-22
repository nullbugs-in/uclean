import type { Service } from "@/db/types";

/**
 * Invoice line pricing.
 *
 * Kept apart from `src/server/billing.ts` on purpose: that module opens a
 * Supabase client, so it cannot be imported by a plain test. This is the half of
 * billing that is pure arithmetic over the catalogue -- and the half most worth
 * testing, because it is where a line's name and rate are decided.
 */

/** One billable line, as the admin submits it: a catalogue service and how many. */
export type InvoiceLineInput = {
  serviceId: string;
  qty: number;
  notes?: string | null;
  photoUrl?: string | null;
};

/** The catalogue fields a line needs. A whole `services` row satisfies this. */
export type CatalogueEntry = Pick<
  Service,
  "id" | "name" | "price" | "is_active"
>;

/** A line ready to write, priced from the catalogue. */
export type PricedLine = {
  order_id: string;
  service_id: string;
  item_name: string;
  qty: number;
  unit_price: number;
  notes: string | null;
  photo_url: string | null;
};

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

/**
 * Prices the draft lines from the catalogue.
 *
 * The catalogue is the only source of a line's name and rate: the caller sends
 * service ids and quantities and nothing else. A line naming a service the
 * catalogue does not have, or one that has been retired, is refused rather than
 * billed at a guess.
 */
export function priceInvoiceLines(
  orderId: string,
  items: InvoiceLineInput[],
  catalogue: CatalogueEntry[],
): { lines: PricedLine[]; subtotal: number } {
  const byId = new Map(catalogue.map((entry) => [entry.id, entry]));

  const lines = items.map((item) => {
    const service = byId.get(item.serviceId);

    if (!service) {
      throw new BillingError(
        `service ${item.serviceId} is not on the catalogue`,
        "One of those services is no longer on the price list.",
      );
    }

    if (!service.is_active) {
      throw new BillingError(
        `service ${service.id} is retired`,
        `"${service.name}" has been retired, so it cannot be billed.`,
      );
    }

    return {
      order_id: orderId,
      service_id: service.id,
      item_name: service.name,
      qty: item.qty,
      unit_price: Number(service.price),
      notes: item.notes ?? null,
      photo_url: item.photoUrl ?? null,
    };
  });

  const subtotal = lines.reduce(
    (sum, line) => sum + line.qty * line.unit_price,
    0,
  );

  return { lines, subtotal };
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
