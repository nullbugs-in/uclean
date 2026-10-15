"use client";

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

import { formatFullDate } from "../format";

import { formatPrice } from "@/lib/utils";

import type { DeliveryQuote } from "../delivery-charge";
import type { SelectedService } from "../service-selection";
import {
  DeliveryChargeRow,
  FreeDeliveryNudge,
  QuotedTotal,
} from "./delivery-summary";

type ConfirmStepProps = {
  name: string;
  mobile: string;
  addressText: string;
  /** What the customer chose in the services step. */
  services: SelectedService[];
  /** Service subtotal plus the delivery quote, computed by the wizard. */
  delivery: DeliveryQuote;
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
  services,
  delivery,
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
        <Row
          label="Delivery"
          value={
            delivery.isFree
              ? `Free (on orders above ${formatPrice(delivery.freeAboveInr)})`
              : `${formatPrice(delivery.charge)} charge`
          }
        />
        <Row label="Payment" value="Cash on delivery" />
      </dl>

      {services.length > 0 ? (
        <div className="space-y-3 rounded-xl border border-[var(--border)] p-4">
          <div className="flex items-baseline justify-between">
            <p className="font-semibold">Services</p>
            <p className="font-display text-lg font-bold">
              {formatPrice(delivery.subtotal)}
            </p>
          </div>

          <ul className="space-y-1.5">
            {services.map((service) => (
              <li
                key={service.key}
                className="flex items-baseline justify-between gap-3 text-sm"
              >
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
                <span className="shrink-0 font-medium">
                  {formatPrice(service.unitPrice * service.qty)}
                </span>
              </li>
            ))}
          </ul>

          <div className="border-border space-y-2.5 border-t pt-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-muted-foreground text-sm">
                Service total
              </span>
              <span className="text-sm font-medium">
                {formatPrice(delivery.subtotal)}
              </span>
            </div>

            <DeliveryChargeRow quote={delivery} />

            <FreeDeliveryNudge quote={delivery} />

            <QuotedTotal
              quote={delivery}
              className="border-border font-display border-t pt-3 text-xl font-bold"
            />
          </div>

          <p className="text-muted-foreground text-xs">
            Indicative total. The final price, including the delivery charge, is
            confirmed once we receive and assess your items.
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
