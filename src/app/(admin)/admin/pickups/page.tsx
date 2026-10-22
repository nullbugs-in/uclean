import type { Metadata } from "next";

import { AgentWorkloadView } from "../../_components/agent-workload-view";
import {
  PickupRequestList,
  PickupViewSwitch,
  isPickupView,
} from "../../_components/pickup-request-list";
import { PickupRequestLive } from "../../_components/pickup-request-live";
import { requireAdmin } from "@/server/auth";
import { createClient } from "@/db/server";
import { toDateKey } from "@/lib/dates";
import {
  listPickupAgents,
  listPickupRequests,
  type PickupFilter,
} from "@/db/queries/admin-pickups";

import { PanelPage } from "@/components/panel/panel-page";

export const metadata: Metadata = { title: "Pickup management" };

const FILTERS: readonly PickupFilter[] = [
  "all",
  "unassigned",
  "assigned",
  "today",
];

function readFilter(value: string | string[] | undefined): PickupFilter {
  const candidate = Array.isArray(value) ? value[0] : value;
  return FILTERS.includes(candidate as PickupFilter)
    ? (candidate as PickupFilter)
    : "all";
}

/**
 * Pickup management (architecture doc, section 7.2.3):
 * "all requests, pickup details, assign agent (automatic or manual), reassign".
 *
 * Every row here is a real booking made by a customer in the `/book` wizard. The
 * previous version of this page rendered the staff assignment list, which is
 * driven off `pickup_assignments` and therefore only ever showed orders that
 * already had an agent — the requests needing attention were invisible. This
 * page reads `orders` first and joins the assignment on afterwards.
 *
 * Nothing is imported from `(staff)/_components`. Two bugs disappeared with
 * that: the empty state linked admins to `/staff`, and every card's "Open order"
 * link pointed at the staff order screen.
 *
 * Writes go through `./actions.ts`, which is where `requireAdmin()` lives.
 */
export default async function AdminPickupsPage({
  searchParams,
}: {
  searchParams: Promise<{
    filter?: string | string[];
    view?: string | string[];
  }>;
}) {
  await requireAdmin();

  const { filter, view } = await searchParams;
  const activeView = isPickupView(view);
  const supabase = await createClient();

  const [requests, agents] = await Promise.all([
    listPickupRequests(supabase),
    // A failed roster read must not blank the queue, so each is settled on its
    // own rather than together.
    listPickupAgents(supabase).catch((error: unknown) => {
      console.error("Could not load the agent roster", error);
      return [];
    }),
  ]);

  const todayKey = toDateKey(new Date());

  return (
    <PanelPage
      title="Pickup management"
      description="Every pickup a customer has booked, with the agent handling it."
    >
      <div className="space-y-6">
        <PickupRequestLive />

        <PickupViewSwitch view={activeView} search={filterHrefSuffix(filter)} />

        {/*
         * Both views read the same fetched data. The workload view adds no
         * query, it only groups what the queue already has.
         */}
        {activeView === "agents" ? (
          <AgentWorkloadView
            requests={requests}
            agents={agents}
            todayKey={todayKey}
          />
        ) : (
          <PickupRequestList
            requests={requests}
            agents={agents}
            filter={readFilter(filter)}
            todayKey={todayKey}
          />
        )}
      </div>
    </PanelPage>
  );
}

/** Carries an active queue filter across to the other view, so it is not lost. */
function filterHrefSuffix(filter: string | string[] | undefined): string {
  const value = Array.isArray(filter) ? filter[0] : filter;
  return value && value !== "all" ? `?filter=${value}` : "";
}
