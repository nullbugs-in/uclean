import { Ban, Check, Circle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  buildTimeline,
  type TimelineStep,
  type TimelineStepState,
} from "@/db/queries/admin-orders";
import type { Order, OrderStatusHistory } from "@/db/types";
import { cn, formatDateTime } from "@/lib/utils";

/**
 * The operational progress of a booking, top to bottom.
 *
 * Forward-looking, and deliberately not the customer's `OrderTimeline`. That one
 * renders the eight `CUSTOMER_TIMELINE` steps in customer wording and hides the
 * collection handover and the payment states entirely, because a customer has no
 * business tracking which side of an invoice they are on. An admin does, so this
 * uses `ADMIN_TIMELINE`, which is the same sequence with `picked_up`,
 * `payment_pending` and `paid` put back in.
 *
 * The step state comes from `buildTimeline`, which reads the history rather than
 * the current status alone. That matters because it distinguishes four things a
 * single current status cannot:
 *
 *   done     the booking was here, at a known time, changed by a known person
 *   current  it is here now
 *   skipped  the booking moved past this stage without entering it, which is
 *            normal: a cash-on-delivery booking never pauses at "Payment Pending"
 *   upcoming still to come
 *
 * Without the fourth state, a booking that has already been delivered would show
 * a permanently unfinished bar, because `payment_pending` and `invoice_sent` were
 * never entered.
 */
export function BookingProgressTimeline({
  order,
  history,
  actorNames,
}: {
  order: Order;
  history: OrderStatusHistory[];
  actorNames: Record<string, string>;
}) {
  const steps = buildTimeline(order.status, history, actorNames);

  if (order.status === "cancelled") {
    return (
      <div className="space-y-4">
        <div className="border-destructive/30 bg-destructive/5 rounded-lg border px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Ban className="text-destructive size-4" aria-hidden />
            <p className="text-sm font-medium">This booking was cancelled</p>
          </div>

          {order.cancellation_reason ? (
            <p className="text-muted-foreground mt-1 text-sm">
              {order.cancellation_reason}
            </p>
          ) : null}
        </div>

        {/* What it reached first, so the record of the work survives the cancel. */}
        <ol className="space-y-0">
          {steps.map((step, index) => (
            <TimelineRow
              key={step.status}
              step={step}
              last={index === steps.length - 1}
            />
          ))}
        </ol>
      </div>
    );
  }

  return (
    <ol className="space-y-0">
      {steps.map((step, index) => (
        <TimelineRow
          key={step.status}
          step={step}
          last={index === steps.length - 1}
        />
      ))}
    </ol>
  );
}

function TimelineRow({ step, last }: { step: TimelineStep; last: boolean }) {
  const { state } = step;

  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <Marker state={state} />

        {!last ? (
          <span
            aria-hidden
            className={cn(
              "w-px flex-1",
              state === "done" ? "bg-primary" : "bg-border",
            )}
          />
        ) : null}
      </div>

      <div className="min-w-0 flex-1 pb-5">
        <div className="flex flex-wrap items-center gap-2">
          <p
            className={cn(
              "text-sm",
              state === "done" || state === "current"
                ? "font-medium"
                : "text-muted-foreground",
              // A skipped stage is one that never happened, so it is dimmer than
              // one that is merely still ahead.
              state === "skipped" && "text-muted-foreground/60 line-through",
            )}
          >
            {step.label}
          </p>

          {state === "current" ? (
            <Badge className="text-[11px]">Current</Badge>
          ) : null}
        </div>

        {step.at ? (
          <p className="text-muted-foreground mt-0.5 text-xs">
            {formatDateTime(step.at)}
            {step.actor ? ` - ${step.actor}` : ""}
          </p>
        ) : null}

        {step.note ? (
          <p className="text-muted-foreground mt-1 border-l-2 pl-2 text-xs italic">
            {step.note}
          </p>
        ) : null}
      </div>
    </li>
  );
}

function Marker({ state }: { state: TimelineStepState }) {
  const shell = "grid size-6 shrink-0 place-items-center rounded-full border";

  if (state === "done") {
    return (
      <span
        className={cn(
          shell,
          "border-primary bg-primary text-primary-foreground",
        )}
      >
        <Check className="size-3.5" aria-hidden />
        <span className="sr-only">Completed: </span>
      </span>
    );
  }

  if (state === "current") {
    return (
      <span className={cn(shell, "border-primary bg-primary/15 text-primary")}>
        <Circle className="size-2.5 fill-current" aria-hidden />
        <span className="sr-only">Current stage: </span>
      </span>
    );
  }

  return (
    <span className={cn(shell, "border-border text-muted-foreground/50")}>
      <Circle className="size-2" aria-hidden />
      <span className="sr-only">Not reached: </span>
    </span>
  );
}
