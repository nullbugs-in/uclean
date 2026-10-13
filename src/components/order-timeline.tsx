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
      <div className="rounded-md border border-[var(--border)] p-4">
        <Badge variant="destructive">Cancelled</Badge>
        {cancelledAt ? (
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
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
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs",
                  done
                    ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
                    : "border-[var(--border)] bg-transparent text-transparent",
                )}
                aria-hidden="true"
              >
                <Check className="size-3.5" />
              </span>
              {!last ? (
                <span
                  className={cn(
                    "w-px flex-1",
                    done ? "bg-[var(--primary)]" : "bg-[var(--border)]",
                  )}
                />
              ) : null}
            </div>
            <div className="pb-6">
              <p
                className={cn(
                  "text-sm",
                  done ? "font-medium" : "text-[var(--muted-foreground)]",
                )}
              >
                {CUSTOMER_STATUS_LABEL[step]}
                {isCurrent ? (
                  <span className="ml-2 text-xs text-[var(--muted-foreground)]">
                    current
                  </span>
                ) : null}
              </p>
              {timestamps.has(step) ? (
                <p className="text-xs text-[var(--muted-foreground)]">
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
