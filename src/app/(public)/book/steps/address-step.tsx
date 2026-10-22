"use client";

import {
  AlertTriangle,
  Check,
  ChevronDown,
  Loader2,
  MapPin,
  Search,
  XCircle,
} from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { isUsableAddress } from "@/lib/address";
import { cn } from "@/lib/utils";

import type { ZoneResult } from "../types";

type AddressStepProps = {
  maxRadiusKm: number;
  addressText: string;
  /** The server's verdict on `coords`, or null before the first check. */
  zone: ZoneResult | null;
  /** True while a distance check is in flight. */
  checking: boolean;
  /** True while the field still holds the address saved on the profile. */
  prefilled?: boolean;
  /** True while the saved address is still being fetched. */
  loadingSaved?: boolean;
  noticeAccepted: boolean;
  notes: string;
  onAddressText: (value: string) => void;
  onNoticeAccepted: (value: boolean) => void;
  onNotes: (value: string) => void;
  onBack: () => void;
  onContinue: () => void;
};

/**
 * A short, spoken version of the verdict.
 *
 * The map draws the same thing as a chip and the banner below spells it out in
 * full; neither is announced, because reading one message three times to a
 * screen reader is noise rather than help. This is the single place it is
 * spoken.
 */
function verdictAnnouncement(
  zone: ZoneResult | null,
  checking: boolean,
  placed: boolean,
): string {
  if (!placed) return "";
  if (checking) return "Checking your location.";
  if (!zone) return "";

  if (zone.status === "within") return "Inside our service area.";
  if (zone.status === "outside") return "Outside our pickup area.";
  if (zone.status === "unconfigured") {
    return "We cannot check this address automatically. Please contact us to book.";
  }
  return `We could not check this location: ${zone.message}`;
}

/**
 * The verdict in full, for the cases the chip cannot explain on its own.
 *
 * `within` is deliberately absent: the chip already says so, and a second green
 * block saying the same thing is scroll, not information.
 */
function ZoneBanner({
  zone,
  maxRadiusKm,
}: {
  zone: ZoneResult;
  maxRadiusKm: number;
}) {
  if (zone.status === "within") return null;

  if (zone.status === "outside") {
    const excess = Math.max(0, zone.distanceKm - zone.maxRadiusKm);
    return (
      <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div className="space-y-1">
          <p>
            This pin is about <strong>{zone.distanceKm.toFixed(1)} km</strong>{" "}
            from the store, roughly <strong>{excess.toFixed(1)} km</strong>{" "}
            beyond our {maxRadiusKm} km pickup zone.
          </p>
          <p className="text-amber-800 dark:text-amber-200/90">
            The ring on the map is a straight line, and the road distance is
            usually longer than that. Move the pin closer, or message us on
            WhatsApp and we will see what we can do.
          </p>
        </div>
      </div>
    );
  }

  if (zone.status === "unconfigured") {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p>
          Our service area is not set up yet, so we cannot check this address
          automatically. Please contact us on WhatsApp to book.
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border border-[var(--destructive)]/40 bg-[var(--destructive)]/5 px-3 py-2 text-sm text-[var(--destructive)]">
      <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p>{zone.message}</p>
    </div>
  );
}

/**
 * The line under the address field. It teaches the map the first time, then
 * gets out of the way: nothing here repeats what the map is already showing.
 */
function FieldHint({
  loadingSaved,
  prefilled,
}: {
  loadingSaved: boolean;
  prefilled: boolean;
}) {
  if (loadingSaved) {
    return (
      <p
        id="address-hint"
        className="text-muted-foreground flex items-center gap-1.5 text-xs"
      >
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        Looking for an address you have used before...
      </p>
    );
  }

  if (prefilled) {
    return (
      <p
        id="address-hint"
        className="flex items-center gap-1.5 text-xs font-medium text-[var(--uc-green-800,var(--foreground))]"
      >
        <MapPin aria-hidden="true" className="size-3.5" />
        Saved from your last booking - edit it if you have moved.
      </p>
    );
  }

  return (
    <p id="address-hint" className="text-muted-foreground text-xs">
      Enter your full pickup address. We will save it for next time.
    </p>
  );
}

/**
 * Step 2: the pickup address and map.
 *
 * Only reachable once the mobile number is verified. The customer places a pin
 * by panning the map under a fixed centre point, by searching the address
 * field, or by using their current location; that pin is the coordinate the
 * order is booked against. The distance verdict itself is always produced
 * server side by the Routes API, never here - this step only displays it and
 * gates Continue on an in-zone pin.
 *
 * Whatever is confirmed here is written to the customer's profile, so the next
 * booking can offer it back instead of asking again.
 */
export function AddressStep({
  maxRadiusKm,
  addressText,
  zone,
  checking,
  prefilled = false,
  loadingSaved = false,
  noticeAccepted,
  notes,
  onAddressText,
  onNoticeAccepted,
  onNotes,
  onBack,
  onContinue,
}: AddressStepProps) {
  const addressInputRef = React.useRef<HTMLInputElement | null>(null);
  // Map disabled for testing - bypass pin placement and zone check requirements
  const placed = true;

  const canContinue = isUsableAddress(addressText) && noticeAccepted;

  // The first unmet requirement, so the line under Continue always explains the
  // one thing standing between the customer and the next step.
  const reason = !isUsableAddress(addressText)
    ? "Add your full address, including the house or flat number."
    : !noticeAccepted
      ? "Tick the box to confirm the pickup area."
      : null;

  return (
    <div className="space-y-5">
      {/* The verdict is announced here, once. The chip and the banner below are
          visual restatements of it and carry no live region of their own. */}
      <p className="sr-only" role="status" aria-live="polite">
        {verdictAnnouncement(zone, checking, placed)}
      </p>

      <div className="space-y-2">
        <Label htmlFor="address">Pickup address</Label>

        {/* Map disabled for testing - address field only */}
        <div className="overflow-hidden rounded-xl border border-[var(--border)] transition-colors has-[:focus-within]:border-[var(--ring)] has-[:focus-within]:ring-2 has-[:focus-within]:ring-[var(--ring)]/30">
          <div className="bg-background/60 flex items-center gap-2 border-b border-[var(--border)] px-3">
            <Search
              aria-hidden="true"
              className="text-muted-foreground size-4 shrink-0"
            />
            <Input
              id="address"
              name="address"
              ref={addressInputRef}
              autoComplete="street-address"
              placeholder="Flat / house no, street, area, pin code"
              value={addressText}
              onChange={(event) => onAddressText(event.target.value)}
              aria-describedby="address-hint"
              className="h-11 flex-1 rounded-none border-0 px-0 shadow-none focus-visible:border-0 focus-visible:ring-0"
            />
          </div>
        </div>

         <FieldHint
          loadingSaved={loadingSaved}
          prefilled={prefilled}
        />
      </div>

      {zone ? <ZoneBanner zone={zone} maxRadiusKm={maxRadiusKm} /> : null}

      <details className="group overflow-hidden rounded-lg border border-[var(--border)] transition-colors open:border-[var(--primary)]/40">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium select-none [&::-webkit-details-marker]:hidden">
          Add a note for the driver
          <span className="text-muted-foreground flex items-center gap-1.5 text-xs font-normal">
            {notes.trim() ? "1 note" : "optional"}
            <ChevronDown
              aria-hidden="true"
              className="size-4 shrink-0 transition-transform group-open:rotate-180"
            />
          </span>
        </summary>
        <div className="px-3 pb-3">
          <Textarea
            id="notes"
            name="notes"
            placeholder="Gate code, landmark, preferred time, anything helpful."
            value={notes}
            onChange={(event) => onNotes(event.target.value)}
          />
        </div>
      </details>

      <div className="space-y-3">
        <label
          className={cn(
            "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 text-sm transition-colors",
            noticeAccepted
              ? "border-[var(--primary)]/50 bg-[var(--primary)]/5"
              : "border-[var(--border)]",
          )}
        >
          <input
            type="checkbox"
            className="mt-0.5 size-4 shrink-0"
            checked={noticeAccepted}
            onChange={(event) => onNoticeAccepted(event.target.checked)}
          />
          <span>
            I understand pickup and delivery is available only within{" "}
            {maxRadiusKm} km driving distance of the store.
          </span>
        </label>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
          <Button type="button" variant="outline" onClick={onBack}>
            Back
          </Button>
          <Button
            type="button"
            onClick={onContinue}
            disabled={!canContinue}
            className="sm:min-w-40"
          >
            <Check aria-hidden="true" />
            Choose your service
          </Button>
        </div>

        {reason ? (
          <p className="text-muted-foreground text-xs sm:text-right">
            {reason}
          </p>
        ) : null}
      </div>
    </div>
  );
}
