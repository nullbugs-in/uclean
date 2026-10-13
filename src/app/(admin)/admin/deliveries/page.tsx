import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/placeholder";
import { AssignmentList } from "../../../(staff)/staff/pickups/assignment-list";

export const metadata: Metadata = { title: "Delivery management" };

/**
 * Delivery management (section 8.8).
 *
 * Delivery assignment, status, proof of delivery and Cash on Delivery records
 * are collected here. The COD write path exists now as
 * recordCashOnDelivery in src/server/billing.ts.
 */
export default function AdminDeliveriesPage() {
  return (
    <PagePlaceholder
      title="Delivery management"
      description="Out for delivery, proof of delivery and cash collected."
      milestone="Milestone 5"
    >
      <AssignmentList type="delivery" />
    </PagePlaceholder>
  );
}
