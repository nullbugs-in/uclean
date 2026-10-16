import {
  CheckCircle2,
  ClipboardList,
  PackageCheck,
  Shirt,
  Truck,
} from "lucide-react";

import { StatCard } from "@/components/panel/stat-card";
import type { BookingSummary } from "@/db/queries/admin-orders";

/**
 * The headline figures.
 *
 * Every number here is a `count(*)` taken from the database, not a count of the
 * rows on screen. That distinction matters: counting the visible list would make
 * the figures describe the filter rather than the business, so "12 awaiting
 * pickup" would quietly become "3 awaiting pickup" the moment an admin searched
 * for a customer name.
 *
 * "Open" is the one to read first. It is the work that is in the system and not
 * yet finished, which is the number that says how today is going.
 */
export function BookingSummaryCards({ summary }: { summary: BookingSummary }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <StatCard
        label="Open"
        value={summary.open}
        hint="Not delivered or cancelled"
        icon={ClipboardList}
      />
      <StatCard
        label="Awaiting pickup"
        value={summary.awaitingPickup}
        hint="Nobody has collected it yet"
        icon={PackageCheck}
      />
      <StatCard
        label="In progress"
        value={summary.inProgress}
        hint="At the store or billing"
        icon={Shirt}
      />
      <StatCard
        label="Ready for delivery"
        value={summary.readyForDelivery}
        hint="Finished, waiting to go out"
        icon={Truck}
      />
      <StatCard
        label="Delivered"
        value={summary.delivered}
        hint="All time"
        icon={CheckCircle2}
      />
    </div>
  );
}
