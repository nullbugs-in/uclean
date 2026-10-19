import type {
  Invoice,
  Order,
  OrderItem,
  OrderStatus,
  PickupAssignment,
  Profile,
} from "@/db/types";

import type { BookingAgent } from "./admin-orders.view";
import { assemblePickupRequests } from "./admin-pickups.view";

/**
 * Pure read model for the admin delivery queue (section 8.8).
 *
 * A delivery is a pickup wearing the other leg: both are a row on
 * `pickup_assignments` with a `type`, and both ask "which order is waiting on a
 * person with a bag". So the join is not copied here - it is
 * `assemblePickupRequests`, which already carries the two properties that matter
 * (an order with no assignment still appears, and a cancelled or detached
 * assignment reads as unassigned).
 *
 * What this module adds is the part that is genuinely delivery-only: the money
 * the agent is about to collect, and the delivery leg's own two statuses.
 *
 * `slots: []` is passed on purpose. `PickupRequest.slotLabel` resolves the
 * order's *pickup* window, which is the wrong time for a delivery and would
 * print a slot on a card that has nothing to do with when the bag goes out.
 */

/** Statuses that mean "the laundry is done and still with us". */
export const OPEN_DELIVERY_STATUSES: readonly OrderStatus[] = [
  "ready_for_delivery",
  "out_for_delivery",
];

export type DeliveryFilter = "all" | "unassigned" | "assigned" | "out";

export const DELIVERY_FILTERS: readonly DeliveryFilter[] = [
  "all",
  "unassigned",
  "assigned",
  "out",
];

export const DELIVERY_FILTER_LABEL: Record<DeliveryFilter, string> = {
  all: "All",
  unassigned: "Needs an agent",
  assigned: "Assigned",
  out: "Out for delivery",
};

export type DeliveryRequest = {
  order: Order;
  items: OrderItem[];
  /** Resolved as a `BookingAgent` because that is what the control takes. */
  agent: BookingAgent | null;
  /** The bill the agent collects against, or null when none has been raised. */
  invoice: Invoice | null;
  /** Cash already recorded, which is what stops a second collection. */
  collected: boolean;
};

export type DeliveryCounts = {
  all: number;
  unassigned: number;
  assigned: number;
  out: number;
};

/**
 * Joins the reads into the queue.
 *
 * The invoice is joined on `order_id` rather than carried by the assignment,
 * because a delivery can be assigned before anyone has billed for it - the
 * assignment and the money are independent, and a card must render unbilled
 * rather than vanish from the queue.
 */
export function assembleDeliveryRequests(input: {
  orders: Order[];
  items: OrderItem[];
  assignments: PickupAssignment[];
  agents: Pick<Profile, "id" | "full_name" | "mobile">[];
  invoices: Invoice[];
}): DeliveryRequest[] {
  const requests = assemblePickupRequests({
    orders: input.orders,
    items: input.items,
    slots: [],
    assignments: input.assignments,
    agents: input.agents,
  });

  const invoiceByOrder = new Map(
    input.invoices.map((invoice) => [invoice.order_id, invoice]),
  );

  return requests.map((request) => {
    const invoice = invoiceByOrder.get(request.order.id) ?? null;

    return {
      order: request.order,
      items: request.items,
      agent: toDeliveryAgent(
        request.assignment,
        request.agentName,
        request.agentMobile,
      ),
      invoice,
      collected: invoice?.status === "paid",
    };
  });
}

/**
 * An assignment row as the control wants it.
 *
 * An empty `id` for a detached row is the same reading `getAdminOrderDetail`
 * uses: a null `agent_id` is a removed agent, not a missing one. The control
 * treats an empty id as "nobody selected", which is right - there is nobody.
 */
function toDeliveryAgent(
  assignment: PickupAssignment | null,
  agentName: string | null,
  agentMobile: string | null,
): BookingAgent | null {
  if (!assignment) return null;

  return {
    id: assignment.agent_id ?? "",
    fullName: agentName ?? "Agent removed",
    mobile: agentMobile,
    status: assignment.status,
    assignedAt: assignment.assigned_at,
    assignedBy: assignment.assigned_by,
    automated: assignment.assigned_by_type === "auto",
  };
}

/** The tab filter, applied in memory. */
export function applyDeliveryFilter(
  requests: DeliveryRequest[],
  filter: DeliveryFilter,
): DeliveryRequest[] {
  switch (filter) {
    case "unassigned":
      return requests.filter((request) => request.agent === null);
    case "assigned":
      return requests.filter((request) => request.agent !== null);
    case "out":
      return requests.filter(
        (request) => request.order.status === "out_for_delivery",
      );
    case "all":
    default:
      return requests;
  }
}

export function countDeliveries(requests: DeliveryRequest[]): DeliveryCounts {
  return {
    all: requests.length,
    unassigned: requests.filter((request) => request.agent === null).length,
    assigned: requests.filter((request) => request.agent !== null).length,
    out: requests.filter(
      (request) => request.order.status === "out_for_delivery",
    ).length,
  };
}

/**
 * Cash the queue is still holding, not cash it has ever handled.
 *
 * Only unpaid invoices count, so a recorded collection leaves the figure rather
 * than being counted again on the next visit. An assigned-but-unbilled delivery
 * contributes nothing, because there is no number to collect yet.
 */
export function cashToCollect(requests: DeliveryRequest[]): number {
  return requests.reduce(
    (sum, request) =>
      request.invoice && !request.collected ? sum + request.invoice.total : sum,
    0,
  );
}
