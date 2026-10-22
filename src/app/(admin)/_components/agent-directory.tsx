"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, Trash2, UserRoundPlus, Users, X } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import type { PickupAgent } from "@/db/queries/admin-pickups";
import { cn } from "@/lib/utils";

import { setStaffActiveAction } from "../admin/agents/actions";
import {
  createAgentAction,
  removeAgentAction,
  setAgentAvailabilityAction,
} from "../admin/pickups/actions";

/**
 * The delivery-agent roster for the Staff module, and the only way to add to
 * it.
 *
 * It exists because `agents` ships empty and nothing else writes to it: the
 * assignment dropdowns in Pickups and Deliveries (and the automatic rule) would
 * otherwise have nothing to list. This is deliberately the minimum needed to
 * make assignment usable - name, mobile, an on/off duty toggle that the
 * automatic rule reads as `is_available`, and a panel-access toggle that writes
 * `profiles.is_active` so a deactivated agent cannot sign in.
 *
 * Deactivating an agent also takes them off duty first: the automatic rule
 * reads `is_available` only, so an inactive account left on duty would still be
 * auto-assigned pickups nobody can act on.
 *
 * Adding an agent creates a real auth user with a confirmed phone, so they sign
 * in with the same one-time-code flow as a customer. No password is created.
 */
export function AgentDirectory({ agents }: { agents: PickupAgent[] }) {
  const [open, setOpen] = useState(agents.length === 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="text-muted-foreground size-4" aria-hidden />
          Delivery agents
        </CardTitle>
        <CardDescription>
          {agents.length === 0
            ? "Nobody can be assigned a pickup until there is at least one agent."
            : "The people pickups and deliveries are assigned to. Off-duty agents are skipped by auto-assign; deactivated agents cannot sign in."}
        </CardDescription>

        <CardAction>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X aria-hidden /> : <UserRoundPlus aria-hidden />}
            {open ? "Close" : "Add agent"}
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-4">
        {agents.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-6 text-center text-sm">
            No agents yet. Add the first one and the assignment dropdowns fill
            straight away.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {agents.map((agent) => (
              <AgentRow key={agent.id} agent={agent} />
            ))}
          </ul>
        )}

        {open ? <AddAgentForm /> : null}
      </CardContent>
    </Card>
  );
}

function AgentRow({ agent }: { agent: PickupAgent }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle() {
    setError(null);

    startTransition(async () => {
      const result = await setAgentAvailabilityAction({
        agentId: agent.id,
        isAvailable: !agent.isAvailable,
      });

      if (!result.ok) setError(result.message);
    });
  }

  function toggleAccess() {
    setError(null);

    startTransition(async () => {
      const activating = !agent.isActive;

      if (activating) {
        const result = await setStaffActiveAction({
          profileId: agent.id,
          isActive: true,
        });

        if (!result.ok) setError(result.message);
        return;
      }

      // Off duty first, then deactivate: the automatic rule reads
      // `is_available` only, so the account must leave the dispatch pool in the
      // same edit that takes its sign-in away.
      const dutyResult = await setAgentAvailabilityAction({
        agentId: agent.id,
        isAvailable: false,
      });

      if (!dutyResult.ok) {
        setError(dutyResult.message);
        return;
      }

      const accessResult = await setStaffActiveAction({
        profileId: agent.id,
        isActive: false,
      });

      if (!accessResult.ok) setError(accessResult.message);
    });
  }

  function remove() {
    setError(null);

    startTransition(async () => {
      const result = await removeAgentAction({ agentId: agent.id });

      if (!result.ok) {
        // Stay open on failure: the admin needs to read what went wrong, and
        // silently collapsing the row would hide it.
        setError(result.message);
        return;
      }

      setConfirming(false);
    });
  }

  return (
    <li className="border-border bg-card rounded-lg border px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar>
            <AvatarFallback
              className={cn(
                "text-xs font-semibold",
                agent.isActive && agent.isAvailable
                  ? "bg-primary/15 text-foreground"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {initials(agent.fullName)}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-medium">
              <span className="truncate">{agent.fullName}</span>
              {agent.isActive ? (
                <Badge variant={agent.isAvailable ? "success" : "secondary"}>
                  {agent.isAvailable ? "On duty" : "Off duty"}
                </Badge>
              ) : (
                <Badge variant="warning">Deactivated</Badge>
              )}
            </p>

            <p className="text-muted-foreground truncate text-xs">
              {[
                agent.mobile,
                agent.zone ? `Zone ${agent.zone}` : null,
                agent.vehicle,
                `${agent.currentLoad} open`,
              ]
                .filter(Boolean)
                .join(" - ")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {agent.isActive ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={toggle}
            >
              {isPending ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : null}
              {agent.isAvailable ? "Take off duty" : "Put on duty"}
            </Button>
          ) : null}

          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={toggleAccess}
          >
            {isPending ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : null}
            {agent.isActive ? "Remove access" : "Grant access"}
          </Button>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={() => setConfirming(true)}
            aria-label={`Remove ${agent.fullName}`}
            className="text-destructive hover:bg-accent"
          >
            <Trash2 aria-hidden />
            Remove
          </Button>
        </div>
      </div>

      {/*
       * Two steps rather than a window confirm, and the second step says what
       * actually happens. "Are you sure?" tells the admin nothing they can act
       * on; this tells them their pickups go back to the queue and that the
       * account is deleted for good.
       */}
      {confirming ? (
        <div className="border-destructive/30 bg-destructive/5 mt-3 space-y-3 rounded-lg border px-3 py-2.5">
          <p className="text-sm">
            Remove <span className="font-medium">{agent.fullName}</span>?
          </p>

          <ul className="text-muted-foreground space-y-1 text-xs">
            <li>
              {agent.currentLoad > 0
                ? `Their ${agent.currentLoad} open pickup${
                    agent.currentLoad === 1 ? "" : "s"
                  } will go back to Needs an agent.`
                : "They have no open pickups."}
            </li>
            <li>
              Their panel login is deleted too, unless they have customer orders
              of their own - then they keep it and simply come off the list.
            </li>
            <li>
              Their name stops appearing against the pickups they collected. The
              pickup records themselves are kept.
            </li>
          </ul>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={isPending}
              onClick={remove}
            >
              {isPending ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <Trash2 aria-hidden />
              )}
              Remove for good
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={isPending}
              onClick={() => {
                setConfirming(false);
                setError(null);
              }}
            >
              Keep them
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-destructive mt-2 text-xs">
          {error}
        </p>
      ) : null}
    </li>
  );
}

function AddAgentForm() {
  const [fullName, setFullName] = useState("");
  const [mobile, setMobile] = useState("");
  const [zone, setZone] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setFormError(null);
    setNotice(null);

    startTransition(async () => {
      const result = await createAgentAction({
        fullName,
        mobile,
        zone: zone || undefined,
        vehicle: vehicle || undefined,
      });

      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        else setFormError(result.message);
        return;
      }

      setNotice(result.message ?? "Agent added.");
      setFullName("");
      setMobile("");
      setZone("");
      setVehicle("");
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="border-border space-y-4 rounded-lg border p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="agent-name">Full name</Label>
          <Input
            id="agent-name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            autoComplete="name"
            placeholder="Ravi Kumar"
            aria-invalid={Boolean(errors.fullName)}
          />
          {errors.fullName ? (
            <p role="alert" className="text-destructive text-xs">
              {errors.fullName}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="agent-mobile">Mobile number</Label>
          <Input
            id="agent-mobile"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="98765 43210"
            value={mobile}
            onChange={(event) => setMobile(event.target.value)}
            aria-invalid={Boolean(errors.mobile)}
          />
          {errors.mobile ? (
            <p role="alert" className="text-destructive text-xs">
              {errors.mobile}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="agent-zone">
            Zone <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="agent-zone"
            value={zone}
            onChange={(event) => setZone(event.target.value)}
            placeholder="Indiranagar"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="agent-vehicle">
            Vehicle <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="agent-vehicle"
            value={vehicle}
            onChange={(event) => setVehicle(event.target.value)}
            placeholder="KA 05 AB 1234"
          />
        </div>
      </div>

      {formError ? (
        <p role="alert" className="text-destructive text-sm">
          {formError}
        </p>
      ) : null}

      {notice ? (
        <p className="text-muted-foreground text-sm" aria-live="polite">
          {notice}
        </p>
      ) : null}

      <Button type="submit" size="sm" disabled={isPending}>
        {isPending ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : (
          <Plus aria-hidden />
        )}
        Add agent
      </Button>
    </form>
  );
}

/**
 * Two-letter monogram, matching the copy in `user-menu.tsx`.
 *
 * Local to the panel on purpose: the account glass system exports an equivalent,
 * but importing from there would pull its `--uc-*` tokens into the admin panel,
 * which is deliberately scoped the other way.
 */
function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];

  if (!first) return "?";

  if (parts.length === 1) return first.slice(0, 2).toUpperCase();

  const last = parts[parts.length - 1];
  return `${first[0]}${last?.[0] ?? ""}`.toUpperCase();
}
