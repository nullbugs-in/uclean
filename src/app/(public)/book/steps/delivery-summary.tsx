"use client";

import { Truck } from "lucide-react";

import { formatPrice } from "@/lib/utils";

import type { DeliveryQuote } from "../delivery-charge";

/**
 * The pickup and delivery line, shared by the services step and the review step
 * so the same charge is worded and drawn identically in both places.
 *
 * `Free` is stated as a word rather than a struck-through zero, because "₹0"
 * next to a threshold reads like a bug and "Free" reads like the deal it is.
 */
export function DeliveryChargeRow({
  quote,
  className = "",
}: {
  quote: DeliveryQuote;
  className?: string;
}) {
  if (quote.isFree) {
    return (
      <div className={`flex items-baseline justify-between gap-3 ${className}`}>
        <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
          <Truck className="size-3.5" aria-hidden="true" />
          Pickup and delivery
        </span>
        <span className="text-right">
          <span className="bg-primary/20 text-foreground inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tracking-wide uppercase">
            Free
          </span>
          <span className="text-muted-foreground mt-0.5 block text-xs">
            On orders above {formatPrice(quote.freeAboveInr)}
          </span>
        </span>
      </div>
    );
  }

  return (
    <div className={`flex items-baseline justify-between gap-3 ${className}`}>
      <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
        <Truck className="size-3.5" aria-hidden="true" />
        Pickup and delivery
      </span>
      <span className="text-right">
        <span className="font-display font-semibold">
          {formatPrice(quote.charge)}
        </span>
        <span className="text-muted-foreground mt-0.5 block text-xs">
          Free above {formatPrice(quote.freeAboveInr)}
        </span>
      </span>
    </div>
  );
}

/** The "add this much more for free delivery" nudge under the total. */
export function FreeDeliveryNudge({ quote }: { quote: DeliveryQuote }) {
  if (quote.amountToFree === null || quote.amountToFree <= 0) return null;

  return (
    <p className="text-muted-foreground text-xs">
      Add{" "}
      <strong className="text-foreground font-semibold">
        {formatPrice(quote.amountToFree)}
      </strong>{" "}
      more for free pickup and delivery.
    </p>
  );
}

/** The bold bottom line: what the customer is quoted in total. */
export function QuotedTotal({
  quote,
  className = "font-display text-xl font-bold",
}: {
  quote: DeliveryQuote;
  className?: string;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${className}`}>
      <span>Estimated total</span>
      <span>{formatPrice(quote.total)}</span>
    </div>
  );
}
