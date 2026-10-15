import type { Metadata } from "next";

import { AssignmentList } from "../../_components/assignment-list";
import { StaffPage } from "../../_components/staff-page";

export const metadata: Metadata = { title: "My pickups" };

/** Today's assigned pickups (section 10). */
export default function StaffPickupsPage() {
  return (
    <StaffPage
      title="My pickups"
      description="Today and upcoming pickups assigned to you."
    >
      <AssignmentList type="pickup" />
    </StaffPage>
  );
}
