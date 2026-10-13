import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/placeholder";
import { TimeSlotTable } from "./time-slot-table";

export const metadata: Metadata = { title: "Time slots" };

/**
 * Time slot settings (section 8.10).
 *
 * Working hours, the 2 PM to 3 PM break, capacity per slot, and holidays.
 *
 * Capacity is seeded at 0 on purpose. "How many pickups per hourly slot?" is
 * still an open question in the source design, so the seed makes every slot
 * read as full rather than inventing a number. Set it here before booking goes
 * live.
 */
export default function AdminSlotsPage() {
  return (
    <PagePlaceholder
      title="Time slots"
      description="Working hours, capacity per slot, and blocked dates."
      milestone="Milestone 4"
    >
      <TimeSlotTable />
    </PagePlaceholder>
  );
}
