"use client";

import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { OrderStatus } from "@/db/types";
import { allowedTransitions, INTERNAL_STATUS_LABEL } from "@/lib/order-status";

/**
 * Status transition buttons for staff and admin.
 *
 * Renders only the transitions the current status allows, so a user is never
 * offered a button that the database trigger would reject. This is a UI
 * affordance, not the enforcement: the server action re-checks, and the
 * `orders_enforce_transition` trigger is the real gate.
 */
export function OrderStatusActions({
  orderId,
  status,
  onChange,
}: {
  orderId: string;
  status: OrderStatus;
  onChange?: (next: OrderStatus) => Promise<void> | void;
}) {
  const [isPending, startTransition] = useTransition();

  const transitions = allowedTransitions(status);
  if (transitions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {transitions.map((next) => (
        <Button
          key={next}
          size="sm"
          variant={next === "cancelled" ? "destructive" : "outline"}
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await onChange?.(next);
            })
          }
        >
          {INTERNAL_STATUS_LABEL[next]}
        </Button>
      ))}
      <span className="sr-only">Order {orderId}</span>
    </div>
  );
}
