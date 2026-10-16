"use client";

import { useState, useTransition } from "react";
import { Check, Home, Loader2, Pencil, Star, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import type { Address } from "@/db/types";
import { MIN_ADDRESS_LENGTH } from "@/lib/address";
import { cn } from "@/lib/utils";

import {
  deleteAddressAction,
  setDefaultAddressAction,
  updateAddressAction,
} from "@/app/(public)/account/actions";

/**
 * Lets a customer manage the pickup addresses saved from their bookings.
 *
 * Without this, the only way to change what is prefilled at booking time is to
 * complete another booking, which is a poor way to fix a typo and an impossible
 * one for a customer who has moved and does not want to book yet.
 *
 * Addresses are written to the server on each action rather than held locally and
 * saved in a batch, so what is on screen is always what is stored. The list is
 * re-read by the server after every change.
 */
export function AddressManager({ addresses }: { addresses: Address[] }) {
  if (addresses.length === 0) {
    return (
      <div className="border-border rounded-xl border border-dashed p-6 text-center">
        <Home
          className="text-muted-foreground mx-auto size-6"
          aria-hidden="true"
        />
        <p className="mt-2 font-medium">No saved addresses</p>
        <p className="text-muted-foreground mt-1 text-sm">
          The pickup address you confirm while booking is saved here
          automatically, so you never have to type it twice.
        </p>
      </div>
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {addresses.map((address) => (
        <AddressCard key={address.id} address={address} />
      ))}
    </ul>
  );
}

function AddressCard({ address }: { address: Address }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(address.address_text);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setEditing(false);
    setConfirmingDelete(false);
    setDraft(address.address_text);
    setError(null);
  }

  function save() {
    setError(null);

    startTransition(async () => {
      const result = await updateAddressAction({
        id: address.id,
        addressText: draft,
      });

      if (!result.ok) {
        setError(result.fieldErrors?.addressText ?? result.message);
        return;
      }

      reset();
    });
  }

  function makeDefault() {
    setError(null);

    startTransition(async () => {
      const result = await setDefaultAddressAction({ id: address.id });
      if (!result.ok) setError(result.message);
    });
  }

  function remove() {
    setError(null);

    startTransition(async () => {
      const result = await deleteAddressAction({ id: address.id });

      if (!result.ok) {
        setError(result.message);
        setConfirmingDelete(false);
      }
    });
  }

  const canSave = draft.trim().length >= MIN_ADDRESS_LENGTH;

  return (
    <li className="border-border bg-card rounded-xl border p-4">
      {editing ? (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor={`address-${address.id}`}>Pickup address</Label>
            <Input
              id={`address-${address.id}`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              autoComplete="street-address"
              aria-invalid={Boolean(error)}
            />
          </div>

          {error ? (
            <p role="alert" className="text-sm text-[var(--destructive)]">
              {error}
            </p>
          ) : null}

          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={save}
              disabled={isPending || !canSave}
            >
              {isPending ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Check aria-hidden="true" />
              )}
              Save
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={reset}
              disabled={isPending}
            >
              <X aria-hidden="true" />
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <Home className="size-4 shrink-0" aria-hidden="true" />
              {address.label}
              {address.is_default ? (
                <span className="bg-primary/20 text-foreground ml-1 rounded-full px-2 py-0.5 text-xs font-semibold tracking-wide uppercase">
                  Default
                </span>
              ) : null}
            </p>
          </div>

          <p className="text-sm">{address.address_text}</p>

          {error ? (
            <p role="alert" className="text-sm text-[var(--destructive)]">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {!address.is_default ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={makeDefault}
                disabled={isPending}
              >
                <Star aria-hidden="true" />
                Use by default
              </Button>
            ) : null}

            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setEditing(true)}
              disabled={isPending}
            >
              <Pencil aria-hidden="true" />
              Edit
            </Button>

            {confirmingDelete ? (
              <span className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={remove}
                  disabled={isPending}
                >
                  {isPending ? (
                    <Loader2 className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Trash2 aria-hidden="true" />
                  )}
                  Delete for good
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={isPending}
                >
                  Keep it
                </Button>
              </span>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setConfirmingDelete(true)}
                disabled={isPending}
                className={cn("hover:bg-accent text-[var(--destructive)]")}
              >
                <Trash2 aria-hidden="true" />
                Delete
              </Button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
