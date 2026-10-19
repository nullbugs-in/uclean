"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import type { BlockedDate } from "@/db/types";

import { addBlockedDateAction, removeBlockedDateAction } from "./actions";

/**
 * Blocked dates, i.e. store holidays.
 *
 * A blocked date is enforced, not decorative: `getSlotAvailability` refuses the
 * whole day, so the booking wizard will not offer it. That is why the list is
 * shown with its reason rather than as bare dates -- the admin is looking at the
 * days the store is closed, and "why" is the part they will have forgotten.
 */
export function BlockedDatesPanel({ dates }: { dates: BlockedDate[] }) {
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();
  const formRef = React.useRef<HTMLFormElement>(null);

  function handleAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const data = new FormData(event.currentTarget);
    const date = String(data.get("date") ?? "").trim();
    const reason = String(data.get("reason") ?? "").trim();

    startTransition(async () => {
      const result = await addBlockedDateAction({
        date,
        reason: reason === "" ? null : reason,
      });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      formRef.current?.reset();
      setNotice(result.message);
    });
  }

  function handleRemove(date: string) {
    setError(null);
    setNotice(null);

    startTransition(async () => {
      const result = await removeBlockedDateAction(date);

      if (!result.ok) {
        setError(result.message);
        return;
      }

      setNotice(result.message);
    });
  }

  return (
    <div className="space-y-4">
      <form
        ref={formRef}
        onSubmit={handleAdd}
        className="flex flex-wrap items-end gap-3"
      >
        <div className="space-y-2">
          <Label htmlFor="blocked_date">Date</Label>
          <Input
            id="blocked_date"
            name="date"
            type="date"
            className="w-44"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="blocked_reason">Reason</Label>
          <Input
            id="blocked_reason"
            name="reason"
            placeholder="Holiday, maintenance"
            className="w-56"
          />
        </div>
        <Button type="submit" variant="secondary" disabled={isPending}>
          {isPending ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <Plus aria-hidden="true" />
          )}
          Block date
        </Button>
      </form>

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

      {dates.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No dates are blocked. Pickups run on every day the slots are open.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)] rounded-md border border-[var(--border)]">
          {dates.map((entry) => (
            <li
              key={entry.date}
              className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm"
            >
              <div className="space-y-0.5">
                <p className="font-medium tabular-nums">{entry.date}</p>
                {entry.reason ? (
                  <p className="text-muted-foreground">{entry.reason}</p>
                ) : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleRemove(entry.date)}
                disabled={isPending}
                aria-label={`Unblock ${entry.date}`}
              >
                <Trash2 aria-hidden="true" />
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
