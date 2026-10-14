"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

import { createBookingAction, listWeekSlotsAction } from "./actions";
import { AddressStep } from "./steps/address-step";
import { ConfirmStep } from "./steps/confirm-step";
import { DetailsStep } from "./steps/details-step";
import { SlotStep } from "./steps/slot-step";
import { SuccessStep } from "./steps/success-step";
import type {
  BookingSummary,
  LatLng,
  SlotDay,
  WizardStep,
  ZoneResult,
} from "./types";

type BookWizardProps = {
  storeCenter: LatLng;
  maxRadiusKm: number;
  devTestCode: string | null;
  initialIdentity: { name: string; mobile: string } | null;
};

type DistanceResponse = {
  ok?: boolean;
  distanceKm?: number;
  maxRadiusKm?: number;
  reason?: string;
  error?: string;
};

const STEP_LABELS: { id: WizardStep; label: string }[] = [
  { id: "details", label: "Your details" },
  { id: "address", label: "Address" },
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
  const order: WizardStep[] = ["details", "address", "slot", "confirm"];
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
  const [coords, setCoords] = React.useState<LatLng | null>(null);
  const [zone, setZone] = React.useState<ZoneResult | null>(null);
  const [checking, setChecking] = React.useState(false);
  const [noticeAccepted, setNoticeAccepted] = React.useState(false);
  const [noticeAcceptedAt, setNoticeAcceptedAt] = React.useState<string | null>(
    null,
  );
  const [notes, setNotes] = React.useState("");

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

  // Distance check: debounced so dragging the pin does not fire a request per
  // pixel. The verdict always comes from the server.
  //
  // `checking` is raised in the coords handler, not here: a synchronous
  // setState inside an effect body triggers the react-hooks/set-state-in-effect
  // rule and causes a cascading render.
  React.useEffect(() => {
    if (!coords) return;

    let ignore = false;
    const controller = new AbortController();

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch("/api/distance", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(coords),
            signal: controller.signal,
          });
          const body = (await response
            .json()
            .catch(() => null)) as DistanceResponse | null;

          if (ignore) return;

          if (!response.ok || !body) {
            setZone({
              status: "error",
              message:
                body?.error ??
                "We could not check this location. Please try again.",
            });
            return;
          }

          if (body.ok) {
            setZone({
              status: "within",
              distanceKm: body.distanceKm ?? 0,
              maxRadiusKm: body.maxRadiusKm ?? maxRadiusKm,
            });
          } else if (body.reason === "STORE_NOT_CONFIGURED") {
            setZone({ status: "unconfigured" });
          } else {
            setZone({
              status: "outside",
              distanceKm: body.distanceKm ?? 0,
              maxRadiusKm: body.maxRadiusKm ?? maxRadiusKm,
            });
          }
        } catch (error) {
          if (ignore || (error as Error).name === "AbortError") return;
          setZone({
            status: "error",
            message: "We could not check this location. Please try again.",
          });
        } finally {
          if (!ignore) setChecking(false);
        }
      })();
    }, 400);

    return () => {
      ignore = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [coords, maxRadiusKm]);

  function handleVerified(next: { name: string; mobile: string }) {
    setIdentity(next);
    setStep("address");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleCoords(next: LatLng) {
    setCoords(next);
    // Clear the previous verdict immediately so a moved pin never shows a stale
    // "inside our zone" message while the new check is in flight.
    setZone(null);
    setChecking(true);
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

  function goToSlots() {
    setStep("slot");
    if (!weekDays && !loadingSlots) void loadSlots();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function confirmBooking() {
    if (!coords || !slotDate || !slotId || !noticeAcceptedAt) {
      setConfirmError(
        "Something is missing from your booking. Please step back and try again.",
      );
      return;
    }

    setSubmitting(true);
    setConfirmError(null);

    const result = await createBookingAction({
      address: addressText.trim(),
      lat: coords.lat,
      lng: coords.lng,
      notes: notes.trim() || undefined,
      slotDate,
      slotId,
      zoneNoticeAcceptedAt: noticeAcceptedAt,
    });

    setSubmitting(false);

    if (!result.ok) {
      setConfirmError(result.message);
      return;
    }

    setSummary({
      orderId: result.data.orderId,
      orderNo: result.data.orderNo,
      distanceKm: result.data.distanceKm,
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
            center={storeCenter}
            maxRadiusKm={maxRadiusKm}
            addressText={addressText}
            coords={coords}
            zone={zone}
            checking={checking}
            noticeAccepted={noticeAccepted}
            notes={notes}
            onAddressText={setAddressText}
            onCoords={handleCoords}
            onNoticeAccepted={handleNoticeAccepted}
            onNotes={setNotes}
            onBack={() => setStep("details")}
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
            distanceKm={
              zone?.status === "within" || zone?.status === "outside"
                ? zone.distanceKm
                : null
            }
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
