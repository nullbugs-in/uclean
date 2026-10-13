/**
 * The order state machine, mirroring `public.allowed_order_transition` in
 * supabase/migrations/20260101000008_indexes_functions_and_rls.sql.
 *
 * This copy exists so the UI can render only the transitions a user is
 * actually allowed to make. It is NOT the authority: the database trigger
 * `orders_enforce_transition` rejects anything not listed here, so the two must
 * be changed together. src/lib/order-status.test.ts asserts they agree.
 */

export const ORDER_STATUSES = [
  "pickup_requested",
  "agent_assigned",
  "picked_up",
  "under_analysis",
  "invoice_sent",
  "payment_pending",
  "paid",
  "in_process",
  "ready_for_delivery",
  "out_for_delivery",
  "delivered",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Wording the customer sees, from the "Customer sees" column of section 7. */
export const CUSTOMER_STATUS_LABEL: Record<OrderStatus, string> = {
  pickup_requested: "Pickup Scheduled",
  agent_assigned: "Agent Assigned",
  picked_up: "Picked Up",
  under_analysis: "In Process",
  invoice_sent: "Invoice Sent",
  payment_pending: "Payment Pending",
  paid: "Payment Received",
  in_process: "In Process",
  ready_for_delivery: "Ready",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/** Internal label for staff and admin, who use the state names. */
export const INTERNAL_STATUS_LABEL: Record<OrderStatus, string> = {
  pickup_requested: "Pickup Requested",
  agent_assigned: "Agent Assigned",
  picked_up: "Picked Up",
  under_analysis: "Under Analysis",
  invoice_sent: "Invoice Sent",
  payment_pending: "Payment Pending",
  paid: "Paid",
  in_process: "In Process",
  ready_for_delivery: "Ready for Delivery",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/**
 * Allowed transitions, exactly matching the SQL VALUES list. Order matters
 * only for display.
 *
 * `cancelled` is reachable only from the two states that precede pickup.
 * Section 7 says an order may be cancelled "before pickup", so once the agent
 * has collected it the only way out is to finish the delivery.
 */
const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pickup_requested: ["agent_assigned", "cancelled"],
  agent_assigned: ["picked_up", "cancelled"],
  picked_up: ["under_analysis", "invoice_sent"],
  under_analysis: ["invoice_sent", "in_process"],
  invoice_sent: ["payment_pending", "paid", "in_process"],
  payment_pending: ["paid", "in_process"],
  paid: ["in_process", "ready_for_delivery"],
  in_process: ["ready_for_delivery"],
  ready_for_delivery: ["out_for_delivery"],
  out_for_delivery: ["delivered"],
  delivered: [],
  cancelled: [],
};

/** True when the database would accept this transition. */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return false;
  return TRANSITIONS[from].includes(to);
}

export function allowedTransitions(from: OrderStatus): readonly OrderStatus[] {
  return TRANSITIONS[from];
}

export function isTerminalStatus(status: OrderStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

/** The customer-facing timeline from section 6.3, in order. */
export const CUSTOMER_TIMELINE: readonly OrderStatus[] = [
  "pickup_requested",
  "agent_assigned",
  "picked_up",
  "under_analysis",
  "invoice_sent",
  "in_process",
  "ready_for_delivery",
  "out_for_delivery",
  "delivered",
];

/**
 * Steps that are still ahead of the current status, for a progress indicator.
 * Returns 0..1.
 */
export function timelineProgress(
  status: OrderStatus,
  reached: readonly OrderStatus[],
): number {
  if (status === "cancelled") return 0;
  const furthest = reached.reduce((best, step) => {
    const a = CUSTOMER_TIMELINE.indexOf(step);
    const b = CUSTOMER_TIMELINE.indexOf(best);
    return a > b ? step : best;
  }, CUSTOMER_TIMELINE[0] as OrderStatus);
  const index = CUSTOMER_TIMELINE.indexOf(furthest);
  return (index + 1) / CUSTOMER_TIMELINE.length;
}
