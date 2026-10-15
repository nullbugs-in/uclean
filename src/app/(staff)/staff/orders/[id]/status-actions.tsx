"use client";

import { useState } from "react";

import { OrderStatusActions } from "@/components/order-status-actions";
import type { OrderStatus } from "@/db/types";

import { updateOrderStatusAction } from "./actions";

/**
 * Staff status buttons.
 *
 * The shared OrderStatusActions owns which transitions are offered and the
 * pending state; this only adds the error surface, because the action returns a
 * message rather than throwing.
 */
export function StaffOrderStatusActions({
  orderId,
  status,
}: {
  orderId: string;
  status: OrderStatus;
}) {
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
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
        <p role="alert" className="text-sm text-[var(--destructive)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
