import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/placeholder";
import { AssignmentList } from "./assignment-list";

export const metadata: Metadata = { title: "My pickups" };

/** Today's assigned pickups (section 10). */
export default function StaffPickupsPage() {
  return (
    <PagePlaceholder
      title="My pickups"
      description="Today and upcoming pickups assigned to you."
      milestone="Milestone 5"
    >
      <AssignmentList type="pickup" />
    </PagePlaceholder>
  );
}
