import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/placeholder";

export const metadata: Metadata = { title: "Walk-in customers" };

/**
 * Walk-in management (section 8.11).
 *
 * An admin creates a customer by name and mobile, adds an order manually, and
 * the order is tagged source = 'walk_in'. Walk-ins count towards sales and
 * notifications exactly like online orders, because they are the same rows.
 */
export default function AdminWalkInPage() {
  return (
    <PagePlaceholder
      title="Walk-in customers"
      description="Create a customer, add an order manually, generate a bill."
      milestone="Milestone 7"
    >
      <p className="text-sm text-[var(--muted-foreground)]">
        A walk-in is an ordinary order with source = walk_in, created on a staff
        account. book_pickup accepts p_source for exactly this, so the slot
        capacity lock and the zone check still apply.
      </p>
    </PagePlaceholder>
  );
}
