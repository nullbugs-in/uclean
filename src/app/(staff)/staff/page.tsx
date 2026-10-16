import type { Metadata } from "next";
import { CalendarClock, Route, Truck, Warehouse } from "lucide-react";

import { DonutChart } from "@/components/panel/donut-chart";
import { StatCard } from "@/components/panel/stat-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AssignedOrder } from "@/db/queries/staff";
import { getStaffOverview, listAssignedOrders } from "@/db/queries/staff";
import { createClient } from "@/db/server";
import type { AssignmentType } from "@/db/types";
import { toDateKey } from "@/lib/dates";
import { INTERNAL_STATUS_LABEL } from "@/lib/order-status";

import { AssignmentCard } from "../_components/assignment-card";
import { SlotLoadChart } from "../_components/slot-load-chart";
import { PanelPage } from "@/components/panel/panel-page";

export const metadata: Metadata = { title: "Overview" };

/**
 * One leg of today's round, with its own heading so the two never interleave
 * into a single mixed list an agent has to re-sort by eye.
 */
function RoundGroup({
  label,
  rows,
  type,
}: {
  label: string;
  rows: AssignedOrder[];
  type: AssignmentType;
}) {
  if (rows.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {label} &middot; {rows.length}
      </h2>
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((row) => (
          <AssignmentCard key={row.order.id} row={row} type={type} />
        ))}
      </div>
    </section>
  );
}

/**
 * Staff overview - the page `/staff` lands on, which used to redirect away.
 *
 * Everything here is operational: how many stops, how far, where the book is
 * stuck. Money is deliberately absent; it lives in `invoices` and `payments`,
 * which are an admin's to read. Same query on every card, so an agent can rely
 * on the numbers matching whatever the detail screens say later.
 */
export default async function StaffOverviewPage() {
  const supabase = await createClient();
  const today = toDateKey(new Date());

  const [overview, pickups, deliveries] = await Promise.all([
    getStaffOverview(supabase, { days: 7 }),
    listAssignedOrders(supabase, { type: "pickup" }),
    listAssignedOrders(supabase, { type: "delivery" }),
  ]);

  const todayPickups = pickups.filter(
    (row) => row.order.pickup_slot_date === today,
  );
  // Undated deliveries are already waiting to go out, and a delivery past its
  // slot is overdue - either way it belongs in today's round.
  const dueDeliveries = deliveries.filter(
    (row) =>
      row.order.delivery_slot_date === null ||
      row.order.delivery_slot_date <= today,
  );

  const upcoming = pickups.length - todayPickups.length;

  const dateText = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const stopCount = todayPickups.length + dueDeliveries.length;
  const stopText =
    stopCount === 0
      ? "nothing scheduled"
      : stopCount === 1
        ? "1 stop on the round"
        : `${stopCount} stops on the round`;

  return (
    <PanelPage
      title="Your round today"
      description={`${dateText} · ${stopText}`}
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Pickups today"
          value={overview.counts.pickupsToday}
          hint="Stops booked for today"
          icon={CalendarClock}
        />
        <StatCard
          label="To deliver"
          value={overview.counts.deliveriesDue}
          hint="Ready, or already on the road"
          icon={Truck}
        />
        <StatCard
          label="At the store"
          value={overview.counts.atStore}
          hint="Picked up, in the building"
          icon={Warehouse}
        />
        <StatCard
          label="Travel today"
          value={`${overview.distanceKm.toFixed(1)} km`}
          hint="Total across today's stops"
          icon={Route}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Booked load</CardTitle>
            <CardDescription>
              Pickups and deliveries over the next {overview.slotLoad.length}{" "}
              days.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SlotLoadChart days={overview.slotLoad} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Where orders sit</CardTitle>
            <CardDescription>Active orders by state.</CardDescription>
          </CardHeader>
          <CardContent>
            <DonutChart
              rows={overview.statusMix.map((row) => ({
                label: INTERNAL_STATUS_LABEL[row.status],
                value: row.count,
              }))}
              centerLabel="active"
              emptyLabel="Nothing in progress. An order shows up here the moment one is assigned to you."
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Stops</CardTitle>
          <CardDescription>
            Pickups first, then anything going back out.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stopCount === 0 ? (
            <div className="rounded-lg border border-dashed px-6 py-10 text-center">
              <p className="font-medium">No stops booked for today</p>
              <p className="text-muted-foreground mx-auto mt-1 max-w-md text-sm">
                {upcoming > 0
                  ? `${upcoming} more coming up in the next few days.`
                  : "Assignments appear here as soon as an admin hands them over."}
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <RoundGroup label="Pickups" rows={todayPickups} type="pickup" />
              <RoundGroup
                label="Deliveries"
                rows={dueDeliveries}
                type="delivery"
              />
            </div>
          )}
        </CardContent>
      </Card>
    </PanelPage>
  );
}
