import { Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { OrderStatusHistory } from "@/db/types";
import {
  CUSTOMER_STATUS_LABEL,
  CUSTOMER_TIMELINE,
  type OrderStatus,
} from "@/lib/order-status";
import { cn, formatDateTime } from "@/lib/utils";

/**
 * The customer-facing tracking timeline (section 6.3).
 *
 * Rendered from the status history rather than the order's current status, so
 * the timestamps of past steps stay visible after the order moves on. Supabase
 * Realtime pushes new history rows and this re-renders.
 */
export function OrderTimeline({
  status,
  history,
}: {
  status: OrderStatus;
  history: OrderStatusHistory[];
}) {
  if (status === "cancelled") {
    const cancelledAt = history.find(
      (entry) => entry.to_status === "cancelled",
    );
    return (
      <div className="border-border rounded-md border p-4">
        <Badge variant="destructive">Cancelled</Badge>
        {cancelledAt ? (
          <p className="text-muted-foreground mt-2 text-sm">
            {formatDateTime(cancelledAt.created_at)}
          </p>
        ) : null}
      </div>
    );
  }

  const reached = new Set(history.map((entry) => entry.to_status));
  // The current status counts as reached even before its trigger writes history.
  reached.add(status);

  const timestamps = new Map<OrderStatus, string>();
  for (const entry of history) {
    if (!timestamps.has(entry.to_status)) {
      timestamps.set(entry.to_status, entry.created_at);
    }
  }

  return (
    <ol className="space-y-0">
      {CUSTOMER_TIMELINE.map((step, index) => {
        const done = reached.has(step);
        const isCurrent = step === status;
        const last = index === CUSTOMER_TIMELINE.length - 1;

        return (
          <li key={step} className="flex gap-3">
            <div className="flex flex-col items-center">
              {done ? (
                <span
                  className="bg-primary ring-border/40 flex size-6 shrink-0 items-center justify-center rounded-full ring-1"
                  aria-hidden="true"
                >
                  {/* The colour is set twice on purpose: tailwind classes for
                      the normal case, and an inline stroke because a browser
                      extension rewriting currentColor can blank the icon
                      while leaving the circle untouched. */}
                  <Check
                    className="text-primary-foreground size-3.5"
                    style={{ stroke: "var(--primary-foreground)" }}
                    strokeWidth={2.5}
                  />
                </span>
              ) : (
                <span
                  className="border-border size-6 shrink-0 rounded-full border"
                  aria-hidden="true"
                />
              )}
              {!last ? (
                <span
                  className={cn(
                    "w-px flex-1",
                    done ? "bg-primary" : "bg-border",
                  )}
                />
              ) : null}
            </div>
            <div className="pb-6">
              <p
                className={cn(
                  "text-sm",
                  done
                    ? "text-foreground font-medium"
                    : "text-muted-foreground",
                )}
              >
                {CUSTOMER_STATUS_LABEL[step]}
                {isCurrent ? (
                  <span className="text-muted-foreground ml-2 text-xs">
                    current
                  </span>
                ) : null}
              </p>
              {timestamps.has(step) ? (
                <p className="text-muted-foreground text-xs">
                  {formatDateTime(timestamps.get(step))}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
