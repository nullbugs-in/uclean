"use client";

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

import { formatFullDate } from "../format";

type ConfirmStepProps = {
  name: string;
  mobile: string;
  addressText: string;
  distanceKm: number | null;
  slotDate: string;
  slotLabel: string;
  submitting: boolean;
  error: string | null;
  onBack: () => void;
  onConfirm: () => void;
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:gap-6">
      <dt className="text-muted-foreground w-32 shrink-0 text-sm">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}

/** Step 4: final review before the booking is created. */
export function ConfirmStep({
  name,
  mobile,
  addressText,
  distanceKm,
  slotDate,
  slotLabel,
  submitting,
  error,
  onBack,
  onConfirm,
}: ConfirmStepProps) {
  return (
    <div className="space-y-6">
      <dl className="divide-border divide-y rounded-xl border border-[var(--border)] px-4">
        <Row label="Name" value={name} />
        <Row label="Mobile" value={mobile} />
        <Row label="Pickup address" value={addressText} />
        <Row
          label="Distance"
          value={
            distanceKm === null
              ? "-"
              : `About ${distanceKm.toFixed(1)} km from the store`
          }
        />
        <Row label="Pickup day" value={formatFullDate(slotDate)} />
        <Row label="Pickup slot" value={slotLabel} />
        <Row label="Payment" value="Cash on delivery" />
      </dl>

      {error ? (
        <p role="alert" className="text-sm text-[var(--destructive)]">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          disabled={submitting}
        >
          Back
        </Button>
        <Button
          type="button"
          onClick={onConfirm}
          disabled={submitting}
          size="lg"
          className="sm:min-w-48"
        >
          {submitting ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" />
              Confirming...
            </>
          ) : (
            "Confirm booking"
          )}
        </Button>
      </div>
    </div>
  );
}
