import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/placeholder";
import { AssignmentList } from "../../../(staff)/staff/pickups/assignment-list";

export const metadata: Metadata = { title: "Pickup management" };

/**
 * Pickup management (section 8.3).
 *
 * Automatic assignment picks the lowest-load agent who is free in that slot
 * and covers that zone; manual assignment overrides it from a dropdown of free
 * agents. Both are recorded in pickup_assignments with assigned_by_type set to
 * 'auto' or 'manual'.
 */
export default function AdminPickupsPage() {
  return (
    <PagePlaceholder
      title="Pickup management"
      description="All pickup requests with distance, slot and photos."
      milestone="Milestone 4 for automatic and manual assignment"
    >
      <AssignmentList type="pickup" />
      <p className="text-sm text-[var(--muted-foreground)]">
        Assignment buttons and the agent dropdown land in Milestone 4. The list
        above already reflects RLS: as an admin you see every order.
      </p>
    </PagePlaceholder>
  );
}
