"use client";

import { useState, useTransition } from "react";
import { Loader2, Sparkles, UserCheck, UserMinus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PickupAgent } from "@/db/queries/admin-pickups";

import {
  assignAgentAction,
  autoAssignAgentAction,
  unassignAgentAction,
} from "../admin/pickups/actions";

/** Radix reserves the empty string for "nothing selected", so this stands in. */
const NO_AGENT = "__none__";

type Outcome =
  | { ok: true; message?: string; agentName?: string | null }
  | { ok: false; message: string };

/**
 * Assign, reassign or release one pickup.
 *
 * Both routes the doc asks for sit side by side (section 6.3): the automatic rule
 * on one side, a manual override on the other. Once an agent is on the card the
 * same control becomes a reassignment rather than a second owner, so the trigger
 * is prefilled with whoever is currently on it.
 *
 * The primary action is whichever the dispatcher most likely wants. Unassigned
 * leads with Manual because naming an agent is the deliberate act; assigned leads
 * with Auto because the common follow-up is "can someone else take this".
 */
export function PickupAssignmentControls({
  orderId,
  agents,
  assignment,
}: {
  orderId: string;
  agents: PickupAgent[];
  /** Null when nobody is on it. Never carries a null `agent_id`. */
  assignment: { agent_id: string | null } | null;
}) {
  const [selected, setSelected] = useState<string>(
    assignment?.agent_id ?? NO_AGENT,
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  /*
   * The list is for handing work to people who are on duty: off-duty agents
   * are hidden rather than suffix-marked, and they reappear the moment duty
   * resumes. The one exception is whoever currently holds the pickup — they
   * stay listed even if duty lapsed mid-shift, so the prefilled trigger keeps
   * resolving to a real name and the reassign/unassign buttons keep working.
   */
  const assignable = agents.filter(
    (agent) =>
      agent.isAvailable ||
      (assignment?.agent_id && agent.id === assignment.agent_id),
  );

  function run(action: () => Promise<Outcome>) {
    setError(null);
    setNotice(null);

    startTransition(async () => {
      const result = await action();

      if (!result.ok) {
        setError(result.message);
        return;
      }

      setNotice(result.message ?? "Updated.");
    });
  }

  if (assignable.length === 0) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-2 text-xs">
        No agents are on duty right now. Add one in the Staff module, or switch
        duty back on, and they will appear here.
      </p>
    );
  }

  const canAssign = selected !== NO_AGENT && selected !== assignment?.agent_id;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {/*
         * The Select is the primitive rather than a bare <select> so it matches
         * every other dropdown in the panel and inherits the focus ring and
         * disabled states instead of re-implementing them.
         */}
        <Select
          value={selected}
          onValueChange={setSelected}
          disabled={isPending}
        >
          <SelectTrigger size="sm" className="min-w-44 flex-1">
            <SelectValue placeholder="Choose an agent" />
          </SelectTrigger>

          <SelectContent>
            {assignable.map((agent) => (
              <SelectItem key={agent.id} value={agent.id}>
                {agent.fullName} - {agent.currentLoad} open
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          type="button"
          size="sm"
          disabled={isPending || !canAssign}
          onClick={() =>
            run(() =>
              assignAgentAction({
                orderId,
                agentId: selected === NO_AGENT ? "" : selected,
              }),
            )
          }
        >
          {isPending ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <UserCheck aria-hidden />
          )}
          {assignment ? "Reassign" : "Assign"}
        </Button>

        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => run(() => autoAssignAgentAction({ orderId }))}
        >
          <Sparkles aria-hidden />
          Auto-assign
        </Button>

        {assignment ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={() => run(() => unassignAgentAction({ orderId }))}
          >
            <UserMinus aria-hidden />
            Unassign
          </Button>
        ) : null}
      </div>

      {/*
       * Feedback lives inline rather than in a toast or an alert, because it
       * belongs to the row it happened on. A dispatcher working down a queue
       * should not have to hunt for what happened.
       */}
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
