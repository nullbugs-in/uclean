import type { Metadata } from "next";

import { AssignmentList } from "../../_components/assignment-list";
import { StaffPage } from "../../_components/staff-page";

export const metadata: Metadata = { title: "My deliveries" };

/** Assigned deliveries, with a navigation link per stop (section 10). */
export default function StaffDeliveriesPage() {
  return (
    <StaffPage
      title="My deliveries"
      description="Orders due to go back out, with navigation links."
    >
      <AssignmentList type="delivery" />
    </StaffPage>
  );
}
