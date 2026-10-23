"use client";

import { useState } from "react";

import { OrderStatusActions } from "@/components/order-status-actions";
import type { OrderStatus } from "@/db/types";

import { updateOrderStatusAction } from "../staff/orders/actions";

/**
 * Status transition buttons for a stop on an agent's round.
 *
 * Lets a staff member move an order along from the card itself — the cards are
 * now the only surface for it. The shared OrderStatusActions owns which
 * transitions are offered and the pending state, and the status update runs
 * through the one server action behind the staff panel, so authorisation
 * (requireStaff, the state machine, RLS and the transition trigger) is
 * identical no matter which surface the button is on.
 *
 * Renders as a fragment so it can sit inline in the card's action row next to
 * Navigate; an error claims the whole row (`w-full`) and appears on its own
 * line under the buttons.
 */
export function AssignmentStatusActions({
  orderId,
  status,
}: {
  orderId: string;
  status: OrderStatus;
}) {
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <OrderStatusActions
        orderId={orderId}
        status={status}
        onChange={async (next) => {
          setError(null);
          const result = await updateOrderStatusAction(orderId, next);
          if (!result.ok) setError(result.message);
        }}
      />
      {error ? (
        <p role="alert" className="text-destructive w-full text-sm">
          {error}
        </p>
      ) : null}
    </>
  );
}
