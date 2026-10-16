import { addDays, toDateKey } from "@/lib/dates";
import { ORDER_STATUSES } from "@/lib/order-status";

import type {
  AssignmentStatus,
  AssignmentType,
  DbClient,
  Order,
  OrderStatus,
} from "../types";

type Client = DbClient;

function unwrap<T>(result: {
  data: T | null;
  error: { message: string } | null;
}): T {
  if (result.error) {
    throw new Error(result.error.message);
  }
  return result.data as T;
}

/** An assignment still needing work. Completed and cancelled legs are history. */
const OPEN_ASSIGNMENT_STATUSES: readonly AssignmentStatus[] = [
  "assigned",
  "in_progress",
];

/**
 * What each leg of the job means, in the order state machine.
 *
 * The two lists do not overlap, which is the point: an order waiting on a
 * pickup is not a delivery, and the reverse. Pickups are pinned to a slot date
 * because the customer chose one; deliveries are not, because an order can be
 * ready to go back out before a slot has been agreed, and hiding it would hide
 * work that is actually waiting.
 */
const LEGS: Record<
  AssignmentType,
  {
    orderStatuses: readonly OrderStatus[];
    dateColumn: "pickup_slot_date" | "delivery_slot_date" | null;
  }
> = {
  pickup: {
    orderStatuses: ["pickup_requested", "agent_assigned"],
    dateColumn: "pickup_slot_date",
  },
  delivery: {
    orderStatuses: ["ready_for_delivery", "out_for_delivery"],
    dateColumn: null,
  },
};

export type AssignedOrder = {
  order: Order;
  assignmentId: string;
  assignmentStatus: AssignmentStatus;
  assignedAt: string;
};

/**
 * The orders an agent is on the hook for, for one leg of the job.
 *
 * Two queries rather than an embedded join, because the filter that separates
 * pickups from deliveries lives on the assignment row (`type`) while the filter
 * that says whether that leg is still open lives on the order (`status`).
 * PostgREST can express that, but the string is unreadable and untyped; asking
 * the two questions separately keeps both halves checkable.
 *
 * RLS already limits an ordinary agent to their own assignments, so nothing
 * here filters by agent id. Store staff see every order, which is intended.
 */
export async function listAssignedOrders(
  client: Client,
  options: {
    type: AssignmentType;
    /** Inclusive local day key. Defaults to today. */
    from?: string;
    /** Inclusive local day key. */
    to?: string;
    limit?: number;
  },
): Promise<AssignedOrder[]> {
  const leg = LEGS[options.type];
  const limit = options.limit ?? 100;
  const from = options.from ?? toDateKey(new Date());

  const assignments = unwrap(
    await client
      .from("pickup_assignments")
      .select("id, order_id, status, assigned_at")
      .eq("type", options.type)
      .in("status", [...OPEN_ASSIGNMENT_STATUSES])
      .limit(limit),
  );

  if (assignments.length === 0) return [];

  const orderIds = [...new Set(assignments.map((a) => a.order_id))];

  let query = client
    .from("orders")
    .select("*")
    .in("id", orderIds)
    .in("status", [...leg.orderStatuses]);

  if (leg.dateColumn) {
    query = query
      .gte(leg.dateColumn, from)
      .order(leg.dateColumn, { ascending: true });
    if (options.to) {
      query = query.lte(leg.dateColumn, options.to);
    }
  } else {
    query = query.order("created_at", { ascending: true });
  }

  const orders = unwrap(await query.limit(limit));
  const assignmentByOrder = new Map(assignments.map((a) => [a.order_id, a]));

  // Driven by the orders so the query's ordering survives; flatMap instead of
  // filter+map keeps the assignment narrowed without a type predicate.
  return orders.flatMap((order) => {
    const assignment = assignmentByOrder.get(order.id);
    return assignment
      ? [
          {
            order,
            assignmentId: assignment.id,
            assignmentStatus: assignment.status,
            assignedAt: assignment.assigned_at,
          },
        ]
      : [];
  });
}

/** A picked-up order still in the building. */
const AT_STORE_STATUSES: readonly OrderStatus[] = [
  "picked_up",
  "under_analysis",
  "invoice_sent",
  "payment_pending",
  "paid",
  "in_process",
];

const TERMINAL_STATUSES: readonly OrderStatus[] = ["delivered", "cancelled"];

export type StaffOverview = {
  counts: {
    /** Stops booked for the chosen day. */
    pickupsToday: number;
    /** Orders on the active list that are waiting to go back out. */
    deliveriesDue: number;
    atStore: number;
    readyForDelivery: number;
  };
  /** One entry per day in the window, oldest first, including empty days. */
  slotLoad: Array<{ date: string; pickups: number; deliveries: number }>;
  /** Active orders by status, in state-machine order. */
  statusMix: Array<{ status: OrderStatus; count: number }>;
  /** Total travel for the chosen day's stops, in kilometres. */
  distanceKm: number;
};

/**
 * Operational totals for the staff overview.
 *
 * Deliberately money-free. Staff see how much work there is and how far it is,
 * not what it is worth: value lives in `invoices` and `payments`, which only an
 * admin can read. Counting statuses also means this cannot drift when pricing
 * changes.
 *
 * The window and the active list are separate reads because they answer
 * different questions -- "what is booked" versus "what is still open" -- and
 * an order can appear in both.
 */
export async function getStaffOverview(
  client: Client,
  options: { day?: string; days?: number } = {},
): Promise<StaffOverview> {
  const days = Math.max(1, options.days ?? 7);
  const start = options.day ?? toDateKey(new Date());
  const startDate = new Date(`${start}T00:00:00`);
  const end = toDateKey(addDays(startDate, days - 1));

  const [activeResult, pickupResult, deliveryResult] = await Promise.all([
    client
      .from("orders")
      .select("id, status")
      .not("status", "in", `(${TERMINAL_STATUSES.join(",")})`),
    client
      .from("orders")
      .select("*")
      .gte("pickup_slot_date", start)
      .lte("pickup_slot_date", end),
    client
      .from("orders")
      .select("*")
      .gte("delivery_slot_date", start)
      .lte("delivery_slot_date", end),
  ]);

  const active = unwrap(activeResult);
  const windowOrders = new Map<string, Order>();
  for (const order of [...unwrap(pickupResult), ...unwrap(deliveryResult)]) {
    windowOrders.set(order.id, order);
  }

  const slotLoad = Array.from({ length: days }, (_, index) => ({
    date: toDateKey(addDays(startDate, index)),
    pickups: 0,
    deliveries: 0,
  }));
  const bucketByDate = new Map(slotLoad.map((entry) => [entry.date, entry]));

  for (const order of windowOrders.values()) {
    if (order.status === "cancelled") continue;
    const pickupBucket = bucketByDate.get(order.pickup_slot_date);
    if (pickupBucket) pickupBucket.pickups += 1;
    if (order.delivery_slot_date) {
      const deliveryBucket = bucketByDate.get(order.delivery_slot_date);
      if (deliveryBucket) deliveryBucket.deliveries += 1;
    }
  }

  const countByStatus = new Map<OrderStatus, number>();
  for (const order of active) {
    countByStatus.set(order.status, (countByStatus.get(order.status) ?? 0) + 1);
  }

  const distanceKm = [...windowOrders.values()]
    .filter(
      (order) =>
        order.status !== "cancelled" &&
        (order.pickup_slot_date === start || order.delivery_slot_date === start),
    )
    .reduce((total, order) => total + order.distance_km, 0);

  return {
    counts: {
      pickupsToday: slotLoad[0]?.pickups ?? 0,
      deliveriesDue:
        (countByStatus.get("ready_for_delivery") ?? 0) +
        (countByStatus.get("out_for_delivery") ?? 0),
      atStore: AT_STORE_STATUSES.reduce(
        (total, status) => total + (countByStatus.get(status) ?? 0),
        0,
      ),
      readyForDelivery: countByStatus.get("ready_for_delivery") ?? 0,
    },
    slotLoad,
    statusMix: ORDER_STATUSES.filter((status) => countByStatus.has(status)).map(
      (status) => ({ status, count: countByStatus.get(status) ?? 0 }),
    ),
    distanceKm,
  };
}
