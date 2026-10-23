"use client";

import { useState } from "react";

import { OrderStatusActions } from "@/components/order-status-actions";
import type { OrderStatus } from "@/db/types";

import { updateOrderStatusAction } from "../staff/orders/[id]/actions";

/**
 * Status transition buttons for a stop on an agent's round.
 *
 * Lets a staff member mark a pickup picked up (or cancel it) from the card
 * itself rather than opening My Orders. The shared OrderStatusActions owns
 * which transitions are offered and the pending state, and the status update
 * runs through the same server action the order page uses, so authorisation
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
