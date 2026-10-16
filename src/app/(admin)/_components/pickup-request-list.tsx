import Link from "next/link";
import { CalendarClock, PackageCheck, PackageOpen, Truck } from "lucide-react";

import { StatCard } from "@/components/panel/stat-card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  applyPickupFilter,
  countPickups,
  dayHeading,
  groupPickupsByDay,
  isToday,
  type PickupAgent,
  type PickupFilter,
  type PickupRequest,
} from "@/db/queries/admin-pickups";

import { PickupRequestCard } from "./pickup-request-card";

const FILTERS: Array<{ id: PickupFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "unassigned", label: "Needs an agent" },
  { id: "assigned", label: "Assigned" },
  { id: "today", label: "Today" },
];

/**
 * The two ways of reading the same set of pickups.
 *
 * A top-level switch rather than another filter pill, because "needs an agent"
 * and "by agent" are different questions rather than two narrowings of one: the
 * first is a queue to work through, the second is a roster to read load off.
 * Composing them would produce a confusing third thing rather than a useful one.
 */
const VIEWS = [
  { id: "queue", label: "Queue" },
  { id: "agents", label: "By agent" },
] as const;

export type PickupView = (typeof VIEWS)[number]["id"];

export function isPickupView(value: string | string[] | undefined): PickupView {
  const candidate = Array.isArray(value) ? value[0] : value;
  return VIEWS.some((entry) => entry.id === candidate)
    ? (candidate as PickupView)
    : "queue";
}

/** The switch itself, rendered above whichever view is showing. */
export function PickupViewSwitch({
  view,
  search,
}: {
  view: PickupView;
  search: string;
}) {
  return (
    <nav
      aria-label="Switch pickup view"
      className="flex flex-wrap items-center gap-2"
    >
      {VIEWS.map((entry) => {
        const active = entry.id === view;

        return (
          <Link
            key={entry.id}
            href={
              entry.id === "queue"
                ? `/admin/pickups${search}`
                : `/admin/pickups?view=${entry.id}`
            }
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm transition-colors",
              active
                ? "border-primary bg-primary text-primary-foreground font-medium"
                : "border-border hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {entry.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * The pickup dispatch queue.
 *
 * Replaces the staff-shaped list this page used to render. That list was driven
 * off `pickup_assignments`, so a request nobody had picked up yet never appeared
 * — which is precisely the set of requests an admin opens this page to act on.
 *
 * Layout follows the admin dashboard: a row of figures first, so the state of
 * the queue is readable without scrolling, then the requests themselves grouped
 * by day. The figures carry the counts, so the filters below them are pure
 * navigation rather than a second place the same numbers appear.
 */
export function PickupRequestList({
  requests,
  agents,
  filter,
  todayKey,
}: {
  requests: PickupRequest[];
  agents: PickupAgent[];
  filter: PickupFilter;
  todayKey: string;
}) {
  const counts = countPickups(requests, todayKey);
  const visible = applyPickupFilter(requests, filter, todayKey);
  const days = groupPickupsByDay(visible);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Open pickups"
          value={counts.all}
          hint="Waiting to be collected"
          icon={PackageOpen}
        />
        <StatCard
          label="Needs an agent"
          value={counts.unassigned}
          hint="Nobody is on these yet"
          icon={PackageCheck}
        />
        <StatCard
          label="Assigned"
          value={counts.assigned}
          hint="An agent is on the case"
          icon={Truck}
        />
        <StatCard
          label="Pickups today"
          value={counts.today}
          hint="In today's slot window"
          icon={CalendarClock}
        />
      </div>

      <nav
        aria-label="Filter pickups"
        className="flex flex-wrap items-center gap-2"
      >
        {FILTERS.map((entry) => {
          const active = entry.id === filter;

          return (
            <Link
              key={entry.id}
              href={hrefForFilter(entry.id)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground font-medium"
                  : "border-border hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {entry.label}
              {/*
               * The one warning tint on the screen, and only when there is
               * genuinely something to do. Everything else is neutral, so this
               * keeps its meaning as the page gets busier.
               */}
              {entry.id === "unassigned" && counts.unassigned > 0 && !active ? (
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
          <PackageOpen
            className="text-muted-foreground mx-auto size-7"
            aria-hidden
          />
          <p className="mt-3 font-medium">
            {requests.length === 0
              ? "No pickup requests are open."
              : "Nothing matches this filter."}
          </p>
          <p className="text-muted-foreground mx-auto mt-1 max-w-sm text-sm">
            {requests.length === 0
              ? "Bookings made in the customer booking form appear here the moment they are placed."
              : "The All filter shows the rest of the queue."}
          </p>
          {requests.length > 0 ? (
            <Link
              href="/admin/pickups"
              className="text-primary mt-4 inline-block text-sm font-medium underline-offset-4 hover:underline"
            >
              Show all pickups
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="space-y-8">
          {days.map((day) => (
            <section key={day.dateKey} className="space-y-3">
              {/*
               * The eyebrow idiom used elsewhere in the panels: a small
               * uppercase label with the count riding along. Today's group is
               * weighted up because it is the one being worked from.
               */}
              <h2
                className={cn(
                  "text-muted-foreground flex items-center gap-2 text-xs font-medium tracking-wide uppercase",
                  isToday(day.dateKey, todayKey) &&
                    "text-foreground text-sm font-semibold",
                )}
              >
                {dayHeading(day.dateKey, todayKey)}
                <span className="tabular-nums">
                  {day.requests.length} pickup
                  {day.requests.length === 1 ? "" : "s"}
                </span>
                {isToday(day.dateKey, todayKey) ? (
                  <Badge variant="secondary">Today</Badge>
                ) : null}
              </h2>

              <div className="grid gap-3 lg:grid-cols-2">
                {day.requests.map((request) => (
                  <PickupRequestCard
                    key={request.order.id}
                    request={request}
                    agents={agents}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function hrefForFilter(filter: PickupFilter): string {
  if (filter === "all") return "/admin/pickups";

  return `/admin/pickups?filter=${filter}`;
}
