import type {
  Agent,
  Order,
  OrderItem,
  OrderStatus,
  PickupAssignment,
  Profile,
  TimeSlot,
} from "@/db/types";

/**
 * Pure read model for the admin pickup module.
 *
 * Split from `admin-pickups.ts` so it can be tested without a database, and
 * because the one property that matters is a property of this file:
 *
 *   **an order with no assignment must still appear.**
 *
 * The staff list this module replaces was driven off `pickup_assignments`, which
 * meant the requests waiting for an agent were exactly the ones nobody could
 * see. That is the bug the whole module exists to remove, so it gets a test
 * rather than a comment.
 */

/** Statuses that mean "a pickup still to be collected". */
export const OPEN_PICKUP_STATUSES: readonly OrderStatus[] = [
  "pickup_requested",
  "agent_assigned",
];

export type PickupFilter = "all" | "unassigned" | "assigned" | "today";

export type PickupAgent = {
  id: string;
  fullName: string;
  mobile: string | null;
  zone: string | null;
  isAvailable: boolean;
  currentLoad: number;
  vehicle: string | null;
};

/** A pickup request as the admin page renders it. */
export type PickupRequest = {
  order: Order;
  items: OrderItem[];
  /** "10 AM - 11 AM", or null if the slot row has since been removed. */
  slotLabel: string | null;
  assignment: PickupAssignment | null;
  agentName: string | null;
  agentMobile: string | null;
};

export type PickupListOptions = {
  /** Inclusive local day key. Defaults to today. */
  from?: string;
  /** Inclusive local day key. */
  to?: string;
  limit?: number;
};

/**
 * Joins the four reads into one list.
 *
 * Every order produces exactly one entry whether or not an assignment row
 * matched it. Nothing here filters by assignment, which is the point.
 */
export function assemblePickupRequests(input: {
  orders: Order[];
  items: OrderItem[];
  slots: TimeSlot[];
  assignments: PickupAssignment[];
  agents: Pick<Profile, "id" | "full_name" | "mobile">[];
}): PickupRequest[] {
  const itemsByOrder = new Map<string, OrderItem[]>();
  for (const item of input.items) {
    const bucket = itemsByOrder.get(item.order_id);
    if (bucket) bucket.push(item);
    else itemsByOrder.set(item.order_id, [item]);
  }

  const slotById = new Map(input.slots.map((slot) => [slot.id, slot]));
  const agentById = new Map(input.agents.map((agent) => [agent.id, agent]));

  // Two ways an assignment row is not a current owner, and both would otherwise
  // hide a pickup that is nobody's job:
  //
  //   - `cancelled`, which is history; and
  //   - `agent_id` null, which is what an agent removal leaves behind. The row is
  //     kept as history, but with no agent attached it is nobody's pickup, so it
  //     must not read as assigned or it would vanish from the "Needs an agent"
  //     filter while being unworked.
  const assignmentByOrder = new Map<string, PickupAssignment>();
  for (const assignment of input.assignments) {
    if (assignment.status === "cancelled") continue;
    if (assignment.agent_id === null) continue;
    assignmentByOrder.set(assignment.order_id, assignment);
  }

  return input.orders.map((order) => {
    const assignment = assignmentByOrder.get(order.id) ?? null;
    // The null check that matters is above, when the map is built; this one is
    // for the compiler, since a Map value carries the type but not the narrowing.
    const agentId = assignment?.agent_id ?? null;
    const agent = agentId === null ? undefined : agentById.get(agentId);
    const slot = order.pickup_slot_id
      ? slotById.get(order.pickup_slot_id)
      : undefined;

    return {
      order,
      items: itemsByOrder.get(order.id) ?? [],
      slotLabel: slot ? slotLabelOf(slot) : null,
      assignment,
      agentName: agent?.full_name ?? null,
      agentMobile: agent?.mobile ?? null,
    };
  });
}

/** "10 AM - 11 AM", from the slot row, falling back to its raw times. */
export function slotLabelOf(slot: TimeSlot): string {
  if (slot.label) return slot.label;

  return `${to12Hour(slot.start_time)} - ${to12Hour(slot.end_time)}`;
}

function to12Hour(time: string): string {
  const [rawHours = "0", minutes = "00"] = time.split(":");
  const hours = Number(rawHours);
  const suffix = hours >= 12 ? "PM" : "AM";
  const display = hours % 12 === 0 ? 12 : hours % 12;

  return `${display}:${minutes} ${suffix}`;
}

/**
 * Whether the stored coordinates are worth linking to.
 *
 * The booking wizard records the store's own point as a placeholder while the
 * map work is out of scope, so a link built from it would drop a driver at the
 * shop rather than at the customer's flat. Saying nothing beats sending someone
 * somewhere misleading.
 */
export function hasUsableCoordinates(
  lat: number | null,
  lng: number | null,
): boolean {
  if (lat === null || lng === null) return false;

  // Null Island is the classic "never geocoded" sentinel.
  if (lat === 0 && lng === 0) return false;

  return true;
}

/**
 * Applies the list filter in memory.
 *
 * The date window is already narrowed by the query, so this only distinguishes
 * the tabs.
 */
export function applyPickupFilter(
  requests: PickupRequest[],
  filter: PickupFilter,
  todayKey: string,
): PickupRequest[] {
  switch (filter) {
    case "unassigned":
      return requests.filter((request) => request.assignment === null);
    case "assigned":
      return requests.filter((request) => request.assignment !== null);
    case "today":
      return requests.filter(
        (request) => request.order.pickup_slot_date === todayKey,
      );
    case "all":
    default:
      return requests;
  }
}

export type PickupCounts = {
  all: number;
  unassigned: number;
  assigned: number;
  today: number;
};

/** Tab counts for the filter row, taken from the same list it filters. */
export function countPickups(
  requests: PickupRequest[],
  todayKey: string,
): PickupCounts {
  return {
    all: requests.length,
    unassigned: requests.filter((request) => request.assignment === null)
      .length,
    assigned: requests.filter((request) => request.assignment !== null).length,
    today: requests.filter(
      (request) => request.order.pickup_slot_date === todayKey,
    ).length,
  };
}

/** One bucket per day, oldest first, so the queue reads top to bottom. */
export function groupPickupsByDay(
  requests: PickupRequest[],
): Array<{ dateKey: string; requests: PickupRequest[] }> {
  const buckets = new Map<string, PickupRequest[]>();

  for (const request of requests) {
    const key = request.order.pickup_slot_date;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(request);
    else buckets.set(key, [request]);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, entries]) => ({ dateKey, requests: entries }));
}

/** Resolves agent rows plus their profile identity, for the dropdown. */
export function assemblePickupAgents(
  agents: Agent[],
  profiles: Pick<Profile, "id" | "full_name" | "mobile">[],
): PickupAgent[] {
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));

  return agents.map((agent) => {
    const profile = profileById.get(agent.id);

    return {
      id: agent.id,
      fullName: profile?.full_name ?? "Unknown agent",
      mobile: profile?.mobile ?? null,
      zone: agent.zone,
      isAvailable: agent.is_available,
      currentLoad: agent.current_load,
      vehicle: agent.vehicle,
    };
  });
}

/**
 * The heading over a day's group of pickups.
 *
 * A dispatcher reads this queue for "what is mine today", so the first two days
 * are named rather than dated. From the third day back it falls to a weekday and
 * date, which is unambiguous and does not have to be recomputed by eye.
 *
 * Pure and date-keyed rather than a Date, because the keys are local day strings
 * and comparing them avoids a UTC shift.
 */
export function dayHeading(dateKey: string, todayKey: string): string {
  if (dateKey === todayKey) return "Today";

  if (addDaysKey(todayKey, 1) === dateKey) return "Tomorrow";

  const date = new Date(`${dateKey}T00:00:00`);

  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}

/** Whether a day group is today, used to weight the heading. */
export function isToday(dateKey: string, todayKey: string): boolean {
  return dateKey === todayKey;
}

/** Local day key plus a whole number of days, without a UTC round trip. */
export function addDaysKey(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00`);
  date.setDate(date.getDate() + days);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/** One agent's column of the workload view. */
export type AgentWorkload = {
  agent: PickupAgent;
  /** Open pickups they are on, earliest slot date first. */
  requests: PickupRequest[];
  /** How many of those fall in today's slot window. */
  todayCount: number;
  /**
   * Load the database counts against this agent that the board does not show.
   *
   * `agents.current_load` is maintained by a trigger and counts every open
   * assignment; this view only shows what is still an open pickup. When the two
   * disagree the gap is work whose order has moved on while its assignment is
   * still counted, which is worth seeing rather than resolving silently in
   * favour of whichever number was easier to read. Never negative.
   */
  carriedLoad: number;
  /** The slot times they are on, for spotting a stacked day. */
  slotTimes: string[];
  isFree: boolean;
};

/**
 * The roster arranged as a workload: who has what, and when.
 *
 * One bucket per agent, **including agents with nothing assigned**, because
 * "who is free right now" is half of what an admin opens this for, and a list of
 * only busy agents cannot answer it.
 *
 * Pure and exported so the shape can be asserted without a database. The busiest
 * agent comes first, since that is the one an admin is looking for; ties break
 * alphabetically so the order is stable between renders.
 */
export function groupPickupsByAgent(
  requests: PickupRequest[],
  agents: PickupAgent[],
  todayKey: string,
): AgentWorkload[] {
  const assigned = new Map<string, PickupRequest[]>();

  for (const request of requests) {
    const agentId = request.assignment?.agent_id;
    if (!agentId) continue;

    const bucket = assigned.get(agentId);
    if (bucket) bucket.push(request);
    else assigned.set(agentId, [request]);
  }

  return agents
    .map((agent) => {
      const mine = [...(assigned.get(agent.id) ?? [])].sort((a, b) =>
        (a.order.pickup_slot_date ?? "").localeCompare(
          b.order.pickup_slot_date ?? "",
        ),
      );

      return {
        agent,
        requests: mine,
        todayCount: mine.filter(
          (request) => request.order.pickup_slot_date === todayKey,
        ).length,
        carriedLoad: Math.max(0, agent.currentLoad - mine.length),
        slotTimes: mine.map((request) => request.slotLabel ?? "No slot"),
        isFree: mine.length === 0,
      };
    })
    .sort((a, b) => {
      if (a.requests.length !== b.requests.length) {
        return b.requests.length - a.requests.length;
      }
      return a.agent.fullName.localeCompare(b.agent.fullName);
    });
}
