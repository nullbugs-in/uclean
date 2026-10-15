"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

import { createBookingAction, listWeekSlotsAction } from "./actions";
import {
  resolveSelection,
  selectionTotal,
  type ServiceSelection,
} from "./service-selection";
import { AddressStep } from "./steps/address-step";
import { ConfirmStep } from "./steps/confirm-step";
import { DetailsStep } from "./steps/details-step";
import { ServicesStep } from "./steps/services-step";
import { SlotStep } from "./steps/slot-step";
import { SuccessStep } from "./steps/success-step";
import type { CategorySlug } from "@/data/pricing";
import type { BookingSummary, LatLng, SlotDay, WizardStep } from "./types";

type BookWizardProps = {
  storeCenter: LatLng;
  maxRadiusKm: number;
  devTestCode: string | null;
  initialIdentity: { name: string; mobile: string } | null;
};

const STEP_LABELS: { id: WizardStep; label: string }[] = [
  { id: "details", label: "Your details" },
  { id: "address", label: "Address" },
  { id: "services", label: "Services" },
  { id: "slot", label: "Pickup slot" },
  { id: "confirm", label: "Confirm" },
];

function Stepper({
  current,
  verified,
}: {
  current: WizardStep;
  verified: boolean;
}) {
  const order: WizardStep[] = [
    "details",
    "address",
    "services",
    "slot",
    "confirm",
  ];
  const visualStep = current === "success" ? "confirm" : current;
  const currentIndex = order.indexOf(visualStep);

  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
      {STEP_LABELS.map((item, index) => {
        const isDone =
          index < currentIndex || (verified && item.id === "details");
        const isActive =
          item.id === visualStep && !(verified && item.id === "details");

        return (
          <li key={item.id} className="flex items-center gap-2">
            <span
              className={cn(
                "grid size-6 place-items-center rounded-full text-xs font-semibold",
                isActive
                  ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                  : isDone
                    ? "bg-[var(--primary)]/20 text-[var(--foreground)]"
                    : "bg-[var(--muted)] text-[var(--muted-foreground)]",
              )}
              aria-hidden="true"
            >
              {index + 1}
            </span>
            <span
              className={cn(
                isActive
                  ? "text-foreground font-medium"
                  : "text-muted-foreground",
              )}
            >
              {item.label}
            </span>
            {index < STEP_LABELS.length - 1 ? (
              <span
                className="bg-border hidden h-px w-4 sm:block"
                aria-hidden="true"
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The public booking wizard.
 *
 * Steps 2-4 are only reachable after the OTP in step 1 creates a session, and
 * the coordinates they produce are re-validated server side at every stage
 * (distance on request, capacity and distance again inside the booking
 * transaction).
 */
export function BookWizard({
  storeCenter,
  maxRadiusKm,
  devTestCode,
  initialIdentity,
}: BookWizardProps) {
  const [step, setStep] = React.useState<WizardStep>(
    initialIdentity ? "address" : "details",
  );
  const [identity, setIdentity] = React.useState(
    initialIdentity ?? { name: "", mobile: "" },
  );
  const verified = Boolean(initialIdentity) || identity.mobile !== "";

  const [addressText, setAddressText] = React.useState("");
  const [noticeAccepted, setNoticeAccepted] = React.useState(false);
  const [noticeAcceptedAt, setNoticeAcceptedAt] = React.useState<string | null>(
    null,
  );
  const [notes, setNotes] = React.useState("");

  // Service choices, keyed by the stable "<group>/<item>/<option>" key so the
  // customer can switch between Regular and Express without losing them.
  const [category, setCategory] = React.useState<CategorySlug>("regular");
  const [serviceSelection, setServiceSelection] =
    React.useState<ServiceSelection>({});
  const selectedServices = React.useMemo(
    () => resolveSelection(serviceSelection, category),
    [serviceSelection, category],
  );

  const [weekDays, setWeekDays] = React.useState<SlotDay[] | null>(null);
  const [loadingSlots, setLoadingSlots] = React.useState(false);
  const [slotsError, setSlotsError] = React.useState<string | null>(null);
  const [slotDate, setSlotDate] = React.useState<string | null>(null);
  const [slotId, setSlotId] = React.useState<string | null>(null);

  const [submitting, setSubmitting] = React.useState(false);
  const [confirmError, setConfirmError] = React.useState<string | null>(null);
  const [summary, setSummary] = React.useState<BookingSummary | null>(null);

  const selectedSlot = React.useMemo(() => {
    if (!weekDays || !slotDate || !slotId) return null;
    return (
      weekDays
        .find((day) => day.dateKey === slotDate)
        ?.slots.find((slot) => slot.id === slotId) ?? null
    );
  }, [weekDays, slotDate, slotId]);

  function handleVerified(next: { name: string; mobile: string }) {
    setIdentity(next);
    setStep("address");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleNoticeAccepted(value: boolean) {
    setNoticeAccepted(value);
    setNoticeAcceptedAt(value ? new Date().toISOString() : null);
  }

  async function loadSlots() {
    setLoadingSlots(true);
    setSlotsError(null);

    const result = await listWeekSlotsAction();

    setLoadingSlots(false);

    if (!result.ok) {
      setSlotsError(result.message);
      return;
    }

    setWeekDays(result.data);
    const firstOpen = result.data.find((day) => day.slots.length > 0);
    if (firstOpen) setSlotDate(firstOpen.dateKey);
  }

  function goToServices() {
    setStep("services");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goToSlots() {
    setStep("slot");
    if (!weekDays && !loadingSlots) void loadSlots();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function confirmBooking() {
    if (!slotDate || !slotId || !noticeAcceptedAt) {
      setConfirmError(
        "Something is missing from your booking. Please step back and try again.",
      );
      return;
    }

    if (selectedServices.length === 0) {
      setConfirmError("Choose at least one service before confirming.");
      return;
    }

    setSubmitting(true);
    setConfirmError(null);

    // The address step takes no map and does no location work, so the order is
    // recorded against the store point. TEMPORARY for testing: this is a
    // placeholder, not a resolved address, and the real coordinates have to come
    // back (with the zone check) before launch.
    const result = await createBookingAction({
      address: addressText.trim(),
      lat: storeCenter.lat,
      lng: storeCenter.lng,
      notes: notes.trim() || undefined,
      slotDate,
      slotId,
      zoneNoticeAcceptedAt: noticeAcceptedAt,
      items: selectedServices.map((service) => ({
        name: service.option
          ? `${service.item} (${service.option})`
          : service.item,
        qty: service.qty,
        unitPrice: service.unitPrice,
      })),
    });

    setSubmitting(false);

    if (!result.ok) {
      setConfirmError(result.message);
      return;
    }

    setSummary({
      orderId: result.data.orderId,
      orderNo: result.data.orderNo,
      slotDate,
      slotLabel: selectedSlot?.label ?? "",
    });
    setStep("success");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <section className="space-y-8">
      <Stepper current={step} verified={verified} />

      <div className="border-border bg-card rounded-2xl border p-5 shadow-sm sm:p-8">
        {step === "details" ? (
          <DetailsStep
            defaultName={identity.name}
            defaultMobile={identity.mobile}
            devTestCode={devTestCode}
            onVerified={handleVerified}
          />
        ) : null}

        {step === "address" ? (
          <AddressStep
            maxRadiusKm={maxRadiusKm}
            addressText={addressText}
            noticeAccepted={noticeAccepted}
            notes={notes}
            onAddressText={setAddressText}
            onNoticeAccepted={handleNoticeAccepted}
            onNotes={setNotes}
            onBack={() => setStep("details")}
            onContinue={goToServices}
          />
        ) : null}

        {step === "services" ? (
          <ServicesStep
            category={category}
            selection={serviceSelection}
            onCategoryChange={setCategory}
            onSelectionChange={setServiceSelection}
            onBack={() => setStep("address")}
            onContinue={goToSlots}
          />
        ) : null}

        {step === "slot" ? (
          <SlotStep
            weekDays={weekDays}
            loading={loadingSlots}
            error={slotsError}
            selectedDate={slotDate}
            selectedSlotId={slotId}
            onSelectDate={(dateKey) => {
              setSlotDate(dateKey);
              setSlotId(null);
            }}
            onSelectSlot={setSlotId}
            onBack={() => setStep("address")}
            onContinue={() => {
              setStep("confirm");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        ) : null}

        {step === "confirm" ? (
          <ConfirmStep
            name={identity.name}
            mobile={identity.mobile}
            addressText={addressText.trim()}
            services={selectedServices}
            serviceTotal={selectionTotal(selectedServices)}
            slotDate={slotDate ?? ""}
            slotLabel={selectedSlot?.label ?? ""}
            submitting={submitting}
            error={confirmError}
            onBack={() => setStep("slot")}
            onConfirm={confirmBooking}
          />
        ) : null}

        {step === "success" && summary ? (
          <SuccessStep summary={summary} />
        ) : null}
      </div>
    </section>
  );
}
