import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/placeholder";
import { AssignmentList } from "../../../(staff)/staff/pickups/assignment-list";

export const metadata: Metadata = { title: "Orders" };

/**
 * Order updates (section 8.6).
 *
 * Manual status changes from these buttons go through the same
 * orders_enforce_transition trigger as automatic ones, so an admin cannot make
 * an invalid jump either.
 */
export default function AdminOrdersPage() {
  return (
    <PagePlaceholder
      title="Orders"
      description="Every order, with manual status changes and automatic events."
      milestone="Milestone 4"
    >
      <AssignmentList type="pickup" />
    </PagePlaceholder>
  );
}
