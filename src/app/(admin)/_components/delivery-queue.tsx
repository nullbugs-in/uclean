import Link from "next/link";
import { PackageCheck, PackageOpen, Truck, Wallet } from "lucide-react";

import { StatCard } from "@/components/panel/stat-card";
import { Badge } from "@/components/ui/badge";
import {
  DELIVERY_FILTER_LABEL,
  applyDeliveryFilter,
  cashToCollect,
  countDeliveries,
  type DeliveryFilter,
  type DeliveryRequest,
} from "@/db/queries/admin-deliveries";
import type { PickupAgent } from "@/db/queries/admin-pickups";
import { cn, formatINR } from "@/lib/utils";

import { DeliveryCard } from "./delivery-card";

const FILTERS: readonly DeliveryFilter[] = [
  "all",
  "unassigned",
  "assigned",
  "out",
];

/**
 * The delivery dispatch queue (section 8.8).
 *
 * The same shape as the pickup queue, because it is the same job at the other
 * end: a row of figures so the state of the day is readable without scrolling,
 * then the deliveries themselves. What is different is the fourth figure, which
 * counts money rather than jobs - the one number an admin cannot get from the
 * delivery list alone.
 */
export function DeliveryQueue({
  requests,
  agents,
  filter,
}: {
  requests: DeliveryRequest[];
  agents: PickupAgent[];
  filter: DeliveryFilter;
}) {
  const counts = countDeliveries(requests);
  const visible = applyDeliveryFilter(requests, filter);
  const toCollect = cashToCollect(requests);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Out of the wash"
          value={counts.all}
          hint="Ready or already out"
          icon={PackageOpen}
        />
        <StatCard
          label="Needs an agent"
          value={counts.unassigned}
          hint="Nobody is carrying these"
          icon={PackageCheck}
        />
        <StatCard
          label="Out for delivery"
          value={counts.out}
          hint="Left the store already"
          icon={Truck}
        />
        <StatCard
          label="Cash to collect"
          value={formatINR(toCollect)}
          hint="Across the unpaid bills"
          icon={Wallet}
        />
      </div>

      <nav
        aria-label="Filter deliveries"
        className="flex flex-wrap items-center gap-2"
      >
        {FILTERS.map((id) => {
          const active = id === filter;

          return (
            <Link
              key={id}
              href={id === "all" ? "/admin/deliveries" : `?filter=${id}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground font-medium"
                  : "border-border hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {DELIVERY_FILTER_LABEL[id]}
              {/* The one warning tint, and only when there is work waiting. */}
              {id === "unassigned" && counts.unassigned > 0 && !active ? (
                <Badge variant="warning" className="ml-2 align-middle">
                  {counts.unassigned}
                </Badge>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {visible.length === 0 ? (
        <div className="border-border rounded-xl border border-dashed px-6 py-12 text-center">
          <Truck className="text-muted-foreground mx-auto size-7" aria-hidden />
          <p className="mt-3 font-medium">
            {requests.length === 0
              ? "Nothing is waiting to go out."
              : "Nothing matches this filter."}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            {requests.length === 0
              ? "Deliveries appear here once an order is marked ready."
              : "Try another filter."}
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 xl:grid-cols-2">
          {visible.map((request) => (
            <li key={request.order.id}>
              <DeliveryCard request={request} agents={agents} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
