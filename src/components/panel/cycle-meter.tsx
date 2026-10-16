import { cn } from "@/lib/utils";

import {
  CUSTOMER_TIMELINE,
  INTERNAL_STATUS_LABEL,
  type OrderStatus,
} from "@/lib/order-status";

/**
 * Where a status sits when it has no step of its own on the customer timeline.
 *
 * The customer sees the bill go out and then work start, so the two payment
 * states live in between those two steps rather than falling back to zero -
 * which would make a paid order look less advanced than an unpaid one.
 * Values are fractional indices into CUSTOMER_TIMELINE.
 */
const OFF_TIMELINE: Partial<Record<OrderStatus, number>> = {
  payment_pending: 4.35,
  paid: 4.7,
};

/** 0..1 position of a status on the customer-facing timeline. */
export function statusProgress(status: OrderStatus): number {
  if (status === "cancelled") return 0;

  const index = CUSTOMER_TIMELINE.indexOf(status);
  const step = index >= 0 ? index : (OFF_TIMELINE[status] ?? 0);

  return (step + 1) / CUSTOMER_TIMELINE.length;
}

/**
 * Where in the cycle the shop currently is with an order.
 *
 * The whole panel is organised around the twelve-state lifecycle rather than
 * around tables, and this is the one place that lifecycle is drawn: a single
 * track showing an order's progress through it. Delivered closes the bar;
 * cancelled never opens one.
 */
export function CycleMeter({
  status,
  className,
}: {
  status: OrderStatus;
  className?: string;
}) {
  const progress = statusProgress(status);
  const index = CUSTOMER_TIMELINE.indexOf(status);

  let stepLabel: string;
  if (status === "cancelled") {
    stepLabel = "closed";
  } else if (status === "delivered") {
    stepLabel = "complete";
  } else if (index < 0) {
    stepLabel = "payment";
  } else {
    stepLabel = `${index + 1} of ${CUSTOMER_TIMELINE.length}`;
  }

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-foreground text-xs font-medium">
          {INTERNAL_STATUS_LABEL[status]}
        </span>
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
          {stepLabel}
        </span>
      </div>

      <div
        className="bg-muted mt-1.5 h-1.5 w-full overflow-hidden rounded-full"
        role="presentation"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500 ease-out",
            status === "cancelled"
              ? "bg-destructive"
              : status === "delivered"
                ? "bg-emerald-500"
                : "bg-primary",
          )}
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
    </div>
  );
}
