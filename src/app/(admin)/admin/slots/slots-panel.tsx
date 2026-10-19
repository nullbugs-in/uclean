"use client";

import { Loader2, Save } from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { TimeSlot } from "@/db/types";

import { saveTimeSlotsAction } from "./actions";

/**
 * The editable slot grid.
 *
 * The time window is shown but not editable: `time_slots` carries a unique
 * constraint on (start_time, end_time) and existing orders reference the row by
 * id, so moving a window is a different operation from retuning the slot that
 * already exists. Capacity, label and active are what an admin actually tunes.
 *
 * Held in local state rather than submitted as raw form fields because the
 * active toggle is a Radix `Switch`, which is a button in the DOM and carries
 * no value in a `FormData`. Submitting the whole grid at once keeps that
 * honest: an admin sets all nine capacities in one pass and one Save.
 */
type Draft = {
  id: string;
  window: string;
  label: string;
  capacity: string;
  isActive: boolean;
};

function toDrafts(slots: TimeSlot[]): Draft[] {
  return slots.map((slot) => ({
    id: slot.id,
    window: `${slot.start_time.slice(0, 5)} – ${slot.end_time.slice(0, 5)}`,
    label: slot.label ?? "",
    capacity: String(slot.capacity),
    isActive: slot.is_active,
  }));
}

export function SlotsPanel({ slots }: { slots: TimeSlot[] }) {
  const [drafts, setDrafts] = React.useState<Draft[]>(() => toDrafts(slots));
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  function update(id: string, patch: Partial<Draft>) {
    setDrafts((current) =>
      current.map((draft) =>
        draft.id === id ? { ...draft, ...patch } : draft,
      ),
    );
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    startTransition(async () => {
      const result = await saveTimeSlotsAction({
        slots: drafts.map((draft) => {
          const capacity = draft.capacity.trim();
          const label = draft.label.trim();

          return {
            id: draft.id,
            // An empty box is a mistake, not a request to close the slot, so it
            // is sent as NaN and the schema complains rather than silently
            // writing 0.
            capacity: capacity === "" ? Number.NaN : Number(capacity),
            label: label === "" ? null : label,
            isActive: draft.isActive,
          };
        }),
      });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      setNotice(result.message);
    });
  }

  if (drafts.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No slots defined. Run the seed, then reload this page.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left">
              <th className="p-3 font-medium">Window</th>
              <th className="p-3 font-medium">Label</th>
              <th className="p-3 font-medium">Capacity</th>
              <th className="p-3 font-medium">Active</th>
              <th className="p-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {drafts.map((draft) => {
              const capacity = Number(draft.capacity);

              return (
                <tr
                  key={draft.id}
                  className="border-b border-[var(--border)] last:border-0"
                >
                  <td className="text-muted-foreground p-3 whitespace-nowrap tabular-nums">
                    {draft.window}
                  </td>
                  <td className="p-3">
                    <Input
                      value={draft.label}
                      onChange={(event) =>
                        update(draft.id, { label: event.target.value })
                      }
                      aria-label={`Label for the ${draft.window} slot`}
                      className="h-8 min-w-40"
                    />
                  </td>
                  <td className="p-3">
                    <Input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={draft.capacity}
                      onChange={(event) =>
                        update(draft.id, { capacity: event.target.value })
                      }
                      aria-label={`Capacity for the ${draft.window} slot`}
                      className="h-8 w-20"
                    />
                  </td>
                  <td className="p-3">
                    <Switch
                      checked={draft.isActive}
                      onCheckedChange={(checked) =>
                        update(draft.id, { isActive: checked })
                      }
                      aria-label={`Offer the ${draft.window} slot to customers`}
                    />
                  </td>
                  <td className="p-3">
                    <SlotStatus capacity={capacity} isActive={draft.isActive} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <Save aria-hidden="true" />
          )}
          Save slots
        </Button>

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

      <p className="text-muted-foreground text-xs">
        A capacity of 0 closes the slot: it stays listed but the booking wizard
        stops offering it. Deactivating does the same while keeping the row for
        orders that already reference it. Every change appends an audit_logs
        row.
      </p>
    </form>
  );
}

/** The one-word verdict for a slot, matching what the booking flow will do. */
function SlotStatus({
  capacity,
  isActive,
}: {
  capacity: number;
  isActive: boolean;
}) {
  if (!isActive) return <Badge variant="secondary">Inactive</Badge>;

  if (!Number.isFinite(capacity) || capacity <= 0) {
    return <Badge variant="warning">Not configured</Badge>;
  }

  return <Badge variant="success">Bookable</Badge>;
}
