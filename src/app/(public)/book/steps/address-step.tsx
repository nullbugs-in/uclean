"use client";

import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Loader2,
  MapPin,
  XCircle,
} from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { isUsableAddress } from "@/lib/address";
import { cn } from "@/lib/utils";

import { MapPicker } from "../map-picker";
import type { LatLng, ZoneResult } from "../types";

type AddressStepProps = {
  /** Store location: the map's initial view and the point we measure from. */
  center: LatLng;
  maxRadiusKm: number;
  addressText: string;
  /** Coordinates from the map pin, or null until the customer places one. */
  coords: LatLng | null;
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
  onCoords: (value: LatLng) => void;
  onNoticeAccepted: (value: boolean) => void;
  onNotes: (value: string) => void;
  onBack: () => void;
  onContinue: () => void;
};

/**
 * The outcome of the server-side distance check, rendered under the map.
 *
 * `unconfigured` reads as an operational problem rather than "you are too far
 * away", because that is what it is: the store coordinates have not been set.
 */
function ZoneFeedback({
  zone,
  checking,
}: {
  zone: ZoneResult | null;
  checking: boolean;
}) {
  if (checking) {
    return (
      <div className="bg-muted/50 text-muted-foreground flex items-center gap-2 rounded-lg px-3 py-2 text-sm">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Checking your location...
      </div>
    );
  }

  if (!zone) return null;

  if (zone.status === "within") {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p>
          Great news, this address is inside our service area. It is about{" "}
          <strong>{zone.distanceKm.toFixed(1)} km</strong> from the store.
        </p>
      </div>
    );
  }

  if (zone.status === "outside") {
    const excess = Math.max(0, zone.distanceKm - zone.maxRadiusKm);
    return (
      <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div className="space-y-1">
          <p>
            This pin is about <strong>{zone.distanceKm.toFixed(1)} km</strong>{" "}
            from the store, roughly <strong>{excess.toFixed(1)} km</strong>{" "}
            beyond our {zone.maxRadiusKm} km pickup zone.
          </p>
          <p>
            Move the pin closer, pick a nearby landmark, or message us on
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
 * Step 2: the pickup address and map.
 *
 * Only reachable once the mobile number is verified. The customer places a pin
 * (search, drag, tap the map, or "use my current location"); that pin is the
 * coordinate the order is booked against. The distance verdict itself is always
 * produced server side by the Routes API, never here — this step only displays
 * it and gates Continue on an in-zone pin.
 *
 * Whatever is confirmed here is written to the customer's profile, so the next
 * booking can offer it back instead of asking again.
 */
export function AddressStep({
  center,
  maxRadiusKm,
  addressText,
  coords,
  zone,
  checking,
  prefilled = false,
  loadingSaved = false,
  noticeAccepted,
  notes,
  onAddressText,
  onCoords,
  onNoticeAccepted,
  onNotes,
  onBack,
  onContinue,
}: AddressStepProps) {
  const addressInputRef = React.useRef<HTMLInputElement | null>(null);

  const canContinue =
    isUsableAddress(addressText) && noticeAccepted && zone?.status === "within";

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="address">Pickup address</Label>
        <Input
          id="address"
          name="address"
          ref={addressInputRef}
          autoComplete="street-address"
          placeholder="Flat / house no, street, area, pin code"
          value={addressText}
          onChange={(event) => onAddressText(event.target.value)}
        />
        {loadingSaved ? (
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            Looking for an address you have used before...
          </p>
        ) : prefilled ? (
          <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--uc-green-800,var(--foreground))]">
            <MapPin aria-hidden="true" className="size-3.5" />
            Saved from your last booking - edit it if you have moved.
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">
            Start typing and pick your address from the suggestions, then fine
            tune the pin on the map. We will save it for your next booking.
          </p>
        )}
      </div>

      <MapPicker
        center={center}
        value={coords}
        onChange={onCoords}
        onAddressResolved={onAddressText}
        inputRef={addressInputRef}
      />

      <ZoneFeedback zone={zone} checking={checking} />

      <div className="space-y-2">
        <Label htmlFor="notes">Notes for the pickup (optional)</Label>
        <Textarea
          id="notes"
          name="notes"
          placeholder="Gate code, landmark, preferred time, anything helpful."
          value={notes}
          onChange={(event) => onNotes(event.target.value)}
        />
      </div>

      <label
        className={cn(
          "flex items-start gap-3 rounded-lg border px-3 py-3 text-sm",
          noticeAccepted
            ? "border-[var(--primary)]/50 bg-[var(--primary)]/5"
            : "border-[var(--border)]",
        )}
      >
        <input
          type="checkbox"
          className="mt-0.5"
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
    </div>
  );
}
