import { Info } from "lucide-react";

import { siteConfig } from "@/config/site";
import { formatPrice } from "@/lib/utils";

/**
 * The NOTE block from the price list, shown on both pricing pages so the
 * commercial terms travel with the numbers.
 */
export function PricingNotes() {
  const { freeAboveInr, chargeInr } = siteConfig.deliveryPolicy;

  return (
    <aside className="border-border bg-muted/40 rounded-2xl border p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Info aria-hidden="true" className="size-4" />
        Good to know
      </h2>
      <ul className="text-muted-foreground mt-3 space-y-1.5 text-sm">
        <li>All prices include GST.</li>
        <li>
          Pickup and delivery within {siteConfig.deliveryRadiusKm} km of our
          store.
        </li>
        <li>
          Free pickup and delivery on orders above {formatPrice(freeAboveInr)}.
        </li>
        <li>
          Below {formatPrice(freeAboveInr)}, delivery is charged at{" "}
          {formatPrice(chargeInr)}.
        </li>
        <li>Final price is confirmed once we receive and assess your items.</li>
      </ul>
    </aside>
  );
}
