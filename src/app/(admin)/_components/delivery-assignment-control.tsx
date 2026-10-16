"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Truck, UserCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BookingAgent } from "@/db/queries/admin-orders";
import type { PickupAgent } from "@/db/queries/admin-pickups";

import { assignBookingAgentAction } from "../admin/bookings/actions";

const NO_AGENT = "__none__";

/**
 * Naming who is carrying the bag out.
 *
 * Separate from the pickup control because the two legs happen at different
 * points in the job: a pickup agent is needed before collection, a delivery agent
 * only once the laundry is ready. The schema carries both on
 * `pickup_assignments` with a `type` column, and each has its own window.
 *
 * Assigning a delivery agent deliberately does not move the booking. There is no
 * transition for "someone is carrying it" — `ready_for_delivery -> out_for_delivery`
 * describes the bag leaving the store, and inventing a status for who is holding
 * it would mean changing a state machine that the customer timeline, the staff
 * page and the database trigger all share. So this changes who is on the job and
 * nothing about where the booking is.
 */
export function DeliveryAssignmentControl({
  orderId,
  agents,
  assignment,
  canAssign,
}: {
  orderId: string;
  agents: PickupAgent[];
  assignment: BookingAgent | null;
  /** False before the booking is ready, which is when the schema allows it. */
  canAssign: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string>(assignment?.id ?? NO_AGENT);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (agents.length === 0) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-2 text-xs">
        No agents are configured yet. Add one in the roster on the pickups page
        and it will appear here.
      </p>
    );
  }

  const canSubmit =
    canAssign && selected !== NO_AGENT && selected !== assignment?.id;

  function assign() {
    setError(null);
    setNotice(null);

    startTransition(async () => {
      const result = await assignBookingAgentAction({
        orderId,
        agentId: selected,
        kind: "delivery",
      });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      setNotice(result.message ?? "Assigned.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={selected}
          onValueChange={setSelected}
          disabled={isPending || !canAssign}
        >
          <SelectTrigger size="sm" className="min-w-44 flex-1">
            <SelectValue placeholder="Choose a delivery agent" />
          </SelectTrigger>

          <SelectContent>
            {agents.map((agent) => (
              <SelectItem key={agent.id} value={agent.id}>
                {agent.fullName}
                {agent.isAvailable ? "" : " (off duty)"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          type="button"
          size="sm"
          onClick={assign}
          disabled={isPending || !canSubmit}
        >
          {isPending ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <UserCheck aria-hidden />
          )}
          {assignment ? "Reassign" : "Assign"}
        </Button>
      </div>

      {assignment ? (
        <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
          <Truck className="size-3.5" aria-hidden />
          <span>
            {assignment.fullName}
            {assignment.mobile ? ` - ${assignment.mobile}` : ""}
          </span>
          {assignment.automated ? (
            <Badge variant="outline">Auto-assigned</Badge>
          ) : null}
        </div>
      ) : null}

      {!canAssign ? (
        <p className="text-muted-foreground text-xs">
          A delivery agent can be named once the booking is marked ready for
          delivery.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      {notice ? (
        <p className="text-muted-foreground text-sm" aria-live="polite">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
