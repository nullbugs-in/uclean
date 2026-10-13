import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/placeholder";

export const metadata: Metadata = { title: "Staff and agents" };

/**
 * Staff and agent management (section 8.12).
 *
 * Agents are staff users who also carry a row in `agents` (source design
 * decision #1). The agents table keys on profiles.id, so an agent is created
 * by making a staff account and then adding the agent row.
 *
 * Store-wide visibility is the boolean profiles.can_view_all_orders, not a
 * fourth role value.
 */
export default function AdminAgentsPage() {
  return (
    <PagePlaceholder
      title="Staff and agents"
      description="Create staff accounts, set roles, mark agents active, assign zones."
      milestone="Milestone 5"
    >
      <p className="text-sm text-[var(--muted-foreground)]">
        Roles are exactly customer, staff and admin. A staff member who needs to
        see the whole order book gets can_view_all_orders, which the RLS
        policies check through is_store_staff().
      </p>
    </PagePlaceholder>
  );
}
