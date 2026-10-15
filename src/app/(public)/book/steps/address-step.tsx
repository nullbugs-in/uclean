"use client";

import { Check, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type AddressStepProps = {
  maxRadiusKm: number;
  addressText: string;
  /** True while the field still holds the address saved on the profile. */
  prefilled?: boolean;
  noticeAccepted: boolean;
  notes: string;
  onAddressText: (value: string) => void;
  onNoticeAccepted: (value: boolean) => void;
  onNotes: (value: string) => void;
  onBack: () => void;
  onContinue: () => void;
};

/**
 * Step 2: the pickup address.
 *
 * Only reachable once the mobile number is verified. The address is the one
 * thing the customer has to give us, so the step does no location work of its
 * own: no map, no lookup, no distance verdict. The delivery-area notice below
 * still applies and is still recorded on the order.
 */
export function AddressStep({
  maxRadiusKm,
  addressText,
  prefilled = false,
  noticeAccepted,
  notes,
  onAddressText,
  onNoticeAccepted,
  onNotes,
  onBack,
  onContinue,
}: AddressStepProps) {
  const trimmedAddress = addressText.trim();
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
        {prefilled ? (
          <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--uc-green-800,var(--foreground))]">
            <MapPin aria-hidden="true" className="size-3.5" />
            Saved from your last booking - edit it if you have moved.
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">
            Type your full pickup address including the flat or house number,
            area and pin code. We will save it for your next booking.
          </p>
        )}
      </div>

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
