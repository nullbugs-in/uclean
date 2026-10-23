import { ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CycleMeter } from "@/components/panel/cycle-meter";
import { INTERNAL_STATUS_LABEL } from "@/lib/order-status";
import { formatDateTime } from "@/lib/utils";
import { orderStatusLog } from "@/db/queries/admin-orders";
import type { Order, OrderStatusHistory } from "@/db/types";

/**
 * The audit trail an admin reads: who changed what, and when.
 *
 * Not the customer timeline. `OrderTimeline` renders only the eight
 * `CUSTOMER_TIMELINE` steps in customer wording, so it hides `picked_up`,
 * `payment_pending` and `paid` entirely and carries no actor name. This is the
 * record the architecture doc asks for: every transition with who made it,
 * newest first.
 *
 * The rows come from `order_status_history`, which a database trigger writes on
 * any change to `orders.status`. So this log cannot drift from what actually
 * happened, and the customer's tracking timeline is built from the same rows.
 */
export function OrderStatusLog({
  history,
  actorNames,
}: {
  history: OrderStatusHistory[];
  actorNames: Record<string, string>;
}) {
  const entries = orderStatusLog(history, actorNames);

  if (entries.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Nothing has changed on this booking yet.
      </p>
    );
  }

  return (
    <ol className="space-y-0">
      {entries.map((entry, index) => {
        const last = index === entries.length - 1;

        return (
          <li key={`${entry.to}-${entry.at}`} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                aria-hidden
                className="bg-muted text-muted-foreground grid size-6 shrink-0 place-items-center rounded-full text-xs"
              >
                {entries.length - index}
              </span>
              {!last ? <span className="bg-border w-px flex-1" /> : null}
            </div>

            <div className="pb-5">
              <p className="flex flex-wrap items-center gap-1.5 text-sm">
                {entry.from ? (
                  <>
                    <span className="text-muted-foreground">
                      {INTERNAL_STATUS_LABEL[entry.from]}
                    </span>
                    <ArrowRight
                      className="text-muted-foreground size-3.5"
                      aria-hidden
                    />
                  </>
                ) : null}
                <span className="font-medium">{entry.label}</span>
              </p>

              <p className="text-muted-foreground text-xs">
                {formatDateTime(entry.at)}
                {/*
                 * A blank actor is a removed account, not a system event, and
                 * the two are not the same claim. Saying nothing is honest;
                 * "System" would be a guess.
                 */}
                {entry.actor ? ` - ${entry.actor}` : ""}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** The current state, as a meter, for the header of a booking. */
export function OrderStatusHeader({ order }: { order: Order }) {
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-muted-foreground text-xs font-medium">
          Current state
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-2 px-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={order.status === "cancelled" ? "destructive" : "secondary"}
          >
            {INTERNAL_STATUS_LABEL[order.status]}
          </Badge>
        </div>

        <CycleMeter status={order.status} />
      </CardContent>
    </Card>
  );
}
