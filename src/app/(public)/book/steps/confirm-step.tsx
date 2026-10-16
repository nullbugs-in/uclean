"use client";

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

import { formatFullDate } from "../format";

import type { SelectedService } from "../service-selection";

type ConfirmStepProps = {
  name: string;
  mobile: string;
  addressText: string;
  /** What the customer chose in the services step. */
  services: SelectedService[];
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

/**
 * Step 4: final review before the booking is created.
 *
 * No money appears on this screen, by design. The customer confirms what and
 * when, not how much it will cost; pricing, including the pickup and delivery
 * charge, is assessed by the team once the items are received.
 */
export function ConfirmStep({
  name,
  mobile,
  addressText,
  services,
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
        <Row label="Pickup day" value={formatFullDate(slotDate)} />
        <Row label="Pickup slot" value={slotLabel} />
        <Row label="Payment" value="Cash on delivery" />
      </dl>

      {services.length > 0 ? (
        <div className="space-y-3 rounded-xl border border-[var(--border)] p-4">
          <p className="font-semibold">Services</p>

          <ul className="space-y-1.5">
            {services.map((service) => (
              <li key={service.key} className="text-sm">
                <span className="min-w-0">
                  {service.item}
                  {service.option ? (
                    <span className="text-muted-foreground">
                      {" "}
                      ({service.option})
                    </span>
                  ) : null}
                  <span className="text-muted-foreground">
                    {" × "}
                    {service.qty}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          <p className="text-muted-foreground border-border border-t pt-3 text-xs">
            Final pricing is assessed by our team once we receive and inspect
            your items. You will be told the amount before anything is charged.
          </p>
        </div>
      ) : null}

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
