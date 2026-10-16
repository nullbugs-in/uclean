import type { Metadata } from "next";

import { AssignmentList } from "../../_components/assignment-list";
import { PanelPage } from "@/components/panel/panel-page";

export const metadata: Metadata = { title: "My deliveries" };

/** Assigned deliveries, with a navigation link per stop (section 10). */
export default function StaffDeliveriesPage() {
  return (
    <PanelPage
      title="My deliveries"
      description="Orders due to go back out, with navigation links."
    >
      <AssignmentList type="delivery" />
    </PanelPage>
  );
}
