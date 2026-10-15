"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  MapPin,
  XCircle,
} from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { forwardGeocode } from "../geocode";
import type { LatLng, ZoneResult } from "../types";

type AddressStepProps = {
  maxRadiusKm: number;
  addressText: string;
  zone: ZoneResult | null;
  checking: boolean;
  noticeAccepted: boolean;
  notes: string;
  onAddressText: (value: string) => void;
  onCoords: (value: LatLng) => void;
  onNoticeAccepted: (value: boolean) => void;
  onNotes: (value: string) => void;
  onBack: () => void;
  onContinue: () => void;
};

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
 * Step 2: the pickup address.
 *
 * Only reachable once the mobile number is verified. The address is the one
 * thing the customer has to give us: the map is out of this step for now, so
 * the typed address is resolved to a position in the background purely to feed
 * the server-side distance check and the zone banner.
 *
 * That lookup is deliberately not a gate. A slow, failed, or out-of-zone
 * lookup must not stop someone booking; it is reported, and the confirm step
 * is where an address we cannot place finally stops the booking.
 */
export function AddressStep({
  maxRadiusKm,
  addressText,
  zone,
  checking,
  noticeAccepted,
  notes,
  onAddressText,
  onCoords,
  onNoticeAccepted,
  onNotes,
  onBack,
  onContinue,
}: AddressStepProps) {
  const [geocoding, setGeocoding] = React.useState(false);
  const [geoWarning, setGeoWarning] = React.useState<string | null>(null);
  /** The exact text the current coordinates were resolved from. */
  const [geocodedFor, setGeocodedFor] = React.useState<string | null>(null);
  // Read through a ref so a re-render in the wizard cannot restart the lookup.
  const onCoordsRef = React.useRef(onCoords);
  React.useEffect(() => {
    onCoordsRef.current = onCoords;
  }, [onCoords]);

  const trimmedAddress = addressText.trim();

  // Resolve the typed address to a position, because the booking still needs
  // coordinates. Debounced because typing fires on every keystroke, and skipped
  // once the text we have already looked up is unchanged.
  React.useEffect(() => {
    if (trimmedAddress.length < 10 || trimmedAddress === geocodedFor) {
      return;
    }

    let ignore = false;

    const timer = window.setTimeout(() => {
      void (async () => {
        setGeocoding(true);
        setGeoWarning(null);

        const position = await forwardGeocode(trimmedAddress);

        if (ignore) return;

        setGeocoding(false);

        if (!position) {
          setGeoWarning(
            "We could not verify this address yet. Check the spelling, or add a pin code or a nearby landmark.",
          );
          return;
        }

        setGeocodedFor(trimmedAddress);
        onCoordsRef.current(position);
      })();
    }, 600);

    return () => {
      ignore = true;
      window.clearTimeout(timer);
    };
  }, [trimmedAddress, geocodedFor]);

  const canContinue = trimmedAddress.length >= 10 && noticeAccepted;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="address">Pickup address</Label>
        <Input
          id="address"
          name="address"
          autoComplete="street-address"
          placeholder="Flat / house no, street, area, pin code"
          value={addressText}
          onChange={(event) => onAddressText(event.target.value)}
        />
        <p className="text-muted-foreground text-xs">
          Type your full pickup address including the flat or house number, area
          and pin code. We will check it against our pickup area.
        </p>
        {geoWarning ? (
          <p role="status" className="text-muted-foreground text-sm">
            {geoWarning}
          </p>
        ) : null}
      </div>

      <ZoneFeedback zone={zone} checking={checking || geocoding} />

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
          {checking || geocoding ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <MapPin aria-hidden="true" />
          )}
          {geocoding || checking
            ? "Checking your address..."
            : "Continue to slots"}
        </Button>
      </div>
    </div>
  );
}
