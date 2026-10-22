import { CheckCircle2, Users } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  dayHeading,
  groupPickupsByAgent,
  type PickupAgent,
  type PickupRequest,
} from "@/db/queries/admin-pickups";
import { cn } from "@/lib/utils";

/**
 * The roster as a workload: who has what, and when.
 *
 * The queue view answers "what needs picking up". This answers the other half an
 * admin asks before pressing auto-assign — "who is free, and who is already
 * carrying too much". The architecture doc's automatic rule picks the lowest-load
 * agent, so knowing the load is what makes that rule reviewable rather than a
 * black box.
 *
 * Agents with nothing assigned are listed too, and sort to the bottom, because a
 * roster of only busy people cannot answer "who can take one more".
 */
export function AgentWorkloadView({
  requests,
  agents,
  todayKey,
}: {
  requests: PickupRequest[];
  agents: PickupAgent[];
  todayKey: string;
}) {
  const workload = groupPickupsByAgent(requests, agents, todayKey);

  if (agents.length === 0) {
    return (
      <div className="border-border rounded-xl border border-dashed px-6 py-12 text-center">
        <Users className="text-muted-foreground mx-auto size-7" aria-hidden />
        <p className="mt-3 font-medium">No agents are on the roster yet.</p>
        <p className="text-muted-foreground mx-auto mt-1 max-w-sm text-sm">
          Add one in the Staff module. Until then, pickups can be assigned by
          hand but auto-assign has nobody to choose from.
        </p>
      </div>
    );
  }

  const busiest = workload.reduce(
    (max, entry) => (entry.requests.length > max ? entry.requests.length : max),
    0,
  );

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {workload.map((entry) => (
        <Card
          key={entry.agent.id}
          className={cn("gap-4 py-4", entry.isFree && "border-dashed")}
        >
          <CardHeader className="px-4">
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarFallback
                  className={cn(
                    "text-xs font-semibold",
                    entry.agent.isAvailable
                      ? "bg-primary/15 text-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {initials(entry.agent.fullName)}
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0">
                <CardTitle className="truncate text-base">
                  {entry.agent.fullName}
                </CardTitle>
                <p className="text-muted-foreground truncate text-xs">
                  {entry.agent.zone
                    ? `Zone ${entry.agent.zone}`
                    : "No zone set"}
                </p>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-3 px-4">
            <div className="flex flex-wrap items-center gap-2">
              {entry.isFree ? (
                <Badge variant="success">
                  <CheckCircle2 className="size-3" aria-hidden />
                  Free
                </Badge>
              ) : (
                <Badge variant="secondary">
                  {entry.requests.length} assigned
                </Badge>
              )}

              {entry.todayCount > 0 ? (
                <Badge variant="outline">{entry.todayCount} today</Badge>
              ) : null}

              {!entry.agent.isAvailable ? (
                <Badge variant="warning">Off duty</Badge>
              ) : null}
            </div>

            {entry.requests.length > 0 ? (
              <ul className="space-y-1.5 text-sm">
                {entry.requests.map((request) => (
                  <li
                    key={request.order.id}
                    className="flex items-baseline justify-between gap-2"
                  >
                    <span className="text-muted-foreground truncate">
                      {dayHeading(request.order.pickup_slot_date, todayKey)}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {request.slotLabel ?? "No slot"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">
                Nothing assigned right now.
              </p>
            )}

            {/*
             * A bar rather than a number, so one overloaded agent is obvious at a
             * glance. Scaled against the busiest agent rather than a fixed
             * ceiling, so a quiet day still shows relative load instead of every
             * bar being the same stub.
             */}
            {busiest > 0 ? (
              <div>
                <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full rounded-full transition-[width] duration-500 ease-out"
                    style={{
                      width: `${Math.round((entry.requests.length / busiest) * 100)}%`,
                    }}
                  />
                </div>

                {entry.carriedLoad > 0 ? (
                  <p className="text-muted-foreground mt-1.5 text-xs">
                    {entry.carriedLoad} more on their count from earlier work.
                  </p>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];

  if (!first) return "?";

  if (parts.length === 1) return first.slice(0, 2).toUpperCase();

  const last = parts[parts.length - 1];
  return `${first[0]}${last?.[0] ?? ""}`.toUpperCase();
}
