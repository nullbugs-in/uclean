"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Info, Loader2, MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { notificationForStatus } from "@/db/queries/admin-orders";
import type { OrderStatus } from "@/db/types";
import { INTERNAL_STATUS_LABEL, allowedTransitions } from "@/lib/order-status";

import { updateOrderStatusAction } from "../admin/bookings/actions";

/**
 * A plain textarea rather than a shared one.
 *
 * `src/components/ui/**` is owned by someone else and this is not a good place to
 * add a primitive, so the field is styled here to match the search box on the
 * bookings list. It inherits the same focus ring and border tokens, so it reads
 * as the same control rather than as a second design language.
 */
function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 placeholder:text-muted-foreground min-h-20 w-full rounded-md border px-3 py-2 text-sm shadow-xs transition-colors focus-visible:ring-[3px] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${className ?? ""}`}
      {...props}
    />
  );
}

/**
 * Moving a booking to its next operational stage.
 *
 * The buttons offered are exactly `allowedTransitions(status)` — every move the
 * state machine permits from where this booking is now, and nothing else. That
 * table is ordered by the operational sequence, so the first entry is the natural
 * next step and leads; the rest sit under "or move it somewhere else".
 *
 * Nothing else gates them. An admin sets the stage; the database decides whether
 * that is a legal stage to be in, and rejects it if it is not. The
 * `enforce_order_transition` trigger is the authority, so there is no path here
 * that can put a booking somewhere the workflow does not allow.
 *
 * Every transition goes through a confirmation dialog rather than firing on the
 * click, because each of these asserts that something physical happened in the
 * world. "Picked Up" is a claim that an agent is holding this customer's laundry
 * right now, and "Delivered" is a claim the customer has had their bag back.
 * Neither should be one stray click away from being true.
 *
 * The dialog is also where the process note is captured, which is what makes the
 * status log useful later: "left at the gate, customer not answering" is the
 * difference between a record and a bare list of statuses.
 */
export function BookingStageActions({
  orderId,
  status,
}: {
  orderId: string;
  status: OrderStatus;
}) {
  const transitions = allowedTransitions(status);
  const [next, ...others] = transitions;
  const [notice, setNotice] = useState<string | null>(null);

  if (transitions.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        This booking is closed, so there is nothing left to change.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/*
       * Shown after a change that succeeded but could not store its note. It
       * lives here rather than in the dialog because the dialog has already
       * closed by the time it is known.
       */}
      {notice ? (
        <p
          role="status"
          className="text-muted-foreground flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs"
        >
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {notice}
        </p>
      ) : null}

      {next ? (
        <ConfirmTransition
          orderId={orderId}
          status={status}
          next={next}
          primary
          onNotice={setNotice}
        />
      ) : null}

      {others.length > 0 ? (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs">
            Or move it somewhere else:
          </p>
          <div className="flex flex-wrap gap-2">
            {others.map((candidate) => (
              <ConfirmTransition
                key={candidate}
                orderId={orderId}
                status={status}
                next={candidate}
                onNotice={setNotice}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * One transition, as a button that opens a confirmation dialog.
 *
 * `status` is passed as well as `next` so the dialog can state the move as
 * "From X to Y" rather than leaving the admin to remember where the booking was.
 * That same value goes to the server as the expected status, which is how a
 * colleague moving the booking first turns into a "reload" message instead of a
 * silent overwrite.
 */
function ConfirmTransition({
  orderId,
  status,
  next,
  primary = false,
  onNotice,
}: {
  orderId: string;
  status: OrderStatus;
  next: OrderStatus;
  primary?: boolean;
  onNotice?: (notice: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const cancelling = next === "cancelled";
  const tells = notificationForStatus(next);
  const reasonMissing = cancelling && reason.trim().length === 0;

  function confirm() {
    setError(null);

    startTransition(async () => {
      const result = await updateOrderStatusAction({
        orderId,
        next,
        expectedStatus: status,
        note,
        reason,
      });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      // Close only once the server has confirmed. Nothing on this page reports
      // success ahead of the database.
      setOpen(false);
      setNote("");
      setReason("");
      onNotice?.(result.warning ?? "");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant={cancelling ? "destructive" : primary ? "default" : "outline"}
        >
          {primary
            ? `Move to ${INTERNAL_STATUS_LABEL[next]}`
            : INTERNAL_STATUS_LABEL[next]}
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move to {INTERNAL_STATUS_LABEL[next]}?</DialogTitle>
          <DialogDescription asChild>
            <p className="flex flex-wrap items-center gap-1.5 text-sm">
              <span className="text-muted-foreground">
                {INTERNAL_STATUS_LABEL[status]}
              </span>
              <ArrowRight
                className="text-muted-foreground size-3.5"
                aria-hidden
              />
              <span className="font-medium">{INTERNAL_STATUS_LABEL[next]}</span>
            </p>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/*
           * The honest part: most of these fire a WhatsApp to the customer from a
           * database trigger. An admin pressing a button does not otherwise know
           * that, and finding out from the customer's next message is not good
           * enough.
           */}
          {tells.customerIsTold ? (
            <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
              <MessageCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              The customer will be messaged on WhatsApp:{" "}
              {tells.template.replace(/_/g, " ")}.
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">
              This change does not message the customer.
            </p>
          )}

          {cancelling ? (
            <div className="space-y-2">
              <Label htmlFor="cancel-reason">Reason for cancelling</Label>
              <Input
                id="cancel-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Customer cancelled, laundry collected in error"
                maxLength={500}
                disabled={isPending}
              />
              <p className="text-muted-foreground text-xs">
                Required. This is what the booking record will say happened.
              </p>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor={`note-${next}`}>
              {cancelling
                ? "Internal note (optional)"
                : "Process note (optional)"}
            </Label>
            <Textarea
              id={`note-${next}`}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Anything the next person should know"
              rows={3}
              maxLength={500}
              disabled={isPending}
            />
            <p className="text-muted-foreground text-xs">
              Saved against this stage in the status log. Only staff and admins
              see it.
            </p>
          </div>

          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            Cancel
          </Button>

          <Button
            type="button"
            variant={cancelling ? "destructive" : "default"}
            onClick={confirm}
            disabled={isPending || reasonMissing}
          >
            {isPending ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : null}
            {isPending ? "Saving..." : `Confirm ${INTERNAL_STATUS_LABEL[next]}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
