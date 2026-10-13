import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/placeholder";
import { AssignmentList } from "../pickups/assignment-list";

export const metadata: Metadata = { title: "My deliveries" };

/** Assigned deliveries, with a navigation link per stop (section 10). */
export default function StaffDeliveriesPage() {
  return (
    <PagePlaceholder
      title="My deliveries"
      description="Orders due for delivery, with navigation links."
      milestone="Milestone 5"
    >
      <AssignmentList type="delivery" />
    </PagePlaceholder>
  );
}
