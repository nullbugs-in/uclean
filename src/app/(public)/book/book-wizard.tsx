"use client";

import * as React from "react";

import { isUsableAddress } from "@/lib/address";
import { cn } from "@/lib/utils";

import {
  createBookingAction,
  getSavedAddressAction,
  listUpcomingSlotsAction,
  saveAddressAction,
} from "./actions";
import { resolveSelection, type ServiceSelection } from "./service-selection";
import { AddressStep } from "./steps/address-step";
import { ConfirmStep } from "./steps/confirm-step";
import { DetailsStep } from "./steps/details-step";
import { ServicesStep } from "./steps/services-step";
import { SlotStep } from "./steps/slot-step";
import { SuccessStep } from "./steps/success-step";
import type { CategorySlug } from "@/data/pricing";
import type {
  AddressSaveState,
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
  /** The customer's last saved address, so it can be prefilled. */
  initialAddress?: string;
};

/** Shape of POST /api/distance's body, as far as this wizard cares about it. */
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
  initialAddress = "",
}: BookWizardProps) {
  const [step, setStep] = React.useState<WizardStep>(
    initialIdentity ? "address" : "details",
  );
  const [identity, setIdentity] = React.useState(
    initialIdentity ?? { name: "", mobile: "" },
  );
  const verified = Boolean(initialIdentity) || identity.mobile !== "";

  const [addressText, setAddressText] = React.useState(initialAddress);
  // Tracked separately so the "saved address" hint disappears the moment the
  // customer starts typing over it.
  const [addressEdited, setAddressEdited] = React.useState(false);
  // Whether the saved address is still on its way. Only true for someone who
  // verified their number during this wizard; an already-signed-in customer was
  // given theirs during the server render.
  const [addressLoading, setAddressLoading] = React.useState(false);
  // Outcome of writing the address to the profile, surfaced on the success step
  // so a customer is never told an address was saved when it was not.
  const [addressSaveState, setAddressSaveState] =
    React.useState<AddressSaveState>("idle");

  function handleAddressText(value: string) {
    setAddressEdited(true);
    setAddressText(value);
  }
  const [noticeAccepted, setNoticeAccepted] = React.useState(false);
  const [noticeAcceptedAt, setNoticeAcceptedAt] = React.useState<string | null>(
    null,
  );
  const [notes, setNotes] = React.useState("");

  // The pin the customer placed on the map. Everything the zone check and the
  // booking itself depend on comes from here, never from the typed address.
  const [coords, setCoords] = React.useState<LatLng | null>(null);
  const [zone, setZone] = React.useState<ZoneResult | null>(null);
  const [checking, setChecking] = React.useState(false);

  // Service choices, keyed by the stable "<group>/<item>/<option>" key so the
  // customer can switch between Regular and Express without losing them.
  const [category, setCategory] = React.useState<CategorySlug>("regular");
  const [serviceSelection, setServiceSelection] =
    React.useState<ServiceSelection>({});
  const selectedServices = React.useMemo(
    () => resolveSelection(serviceSelection, category),
    [serviceSelection, category],
  );

  const [upcomingDays, setUpcomingDays] = React.useState<SlotDay[] | null>(
    null,
  );
  const [loadingSlots, setLoadingSlots] = React.useState(false);
  const [slotsError, setSlotsError] = React.useState<string | null>(null);
  const [slotDate, setSlotDate] = React.useState<string | null>(null);
  const [slotId, setSlotId] = React.useState<string | null>(null);

  const [submitting, setSubmitting] = React.useState(false);
  const [confirmError, setConfirmError] = React.useState<string | null>(null);
  const [summary, setSummary] = React.useState<BookingSummary | null>(null);

  const selectedSlot = React.useMemo(() => {
    if (!upcomingDays || !slotDate || !slotId) return null;
    return (
      upcomingDays
        .find((day) => day.dateKey === slotDate)
        ?.slots.find((slot) => slot.id === slotId) ?? null
    );
  }, [upcomingDays, slotDate, slotId]);

  /**
   * Distance check for the current pin.
   *
   * Debounced so dragging or tapping the map does not fire a request per move,
   * and aborted on cleanup so a stale verdict cannot land after a newer pin.
   * The number is never computed here: the server owns it, so the browser
   * cannot talk itself into the delivery zone.
   *
   * `checking` is raised in `handleCoords`, not in this effect body, because a
   * synchronous setState inside an effect is a cascading render.
   */
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

  function handleCoords(next: LatLng) {
    setCoords(next);
    // Drop the previous verdict immediately so a moved pin never shows a stale
    // "inside our zone" message while the new check is in flight.
    setZone(null);
    setChecking(true);
  }

  /**
   * Fetches the saved address now that there is a session to fetch it for.
   *
   * This is what makes the prefill work for the common case. `/book` is
   * rendered when someone clicks Book Now, which is usually before they have
   * verified anything, so the server render had no session and offered no
   * address. Verifying their number does not re-render the page, so without this
   * the address they gave us last time only ever came back to someone who
   * happened to already be signed in.
   *
   * Only fills an empty field. If they have started typing, or were already
   * given an address, whatever is on screen is what they meant.
   */
  async function prefillSavedAddress() {
    setAddressLoading(true);

    const result = await getSavedAddressAction();

    setAddressLoading(false);

    if (!result.ok || !result.data.addressText) return;

    setAddressText((current) =>
      current.trim() ? current : result.data.addressText,
    );
  }

  function handleVerified(next: { name: string; mobile: string }) {
    setIdentity(next);
    setStep("address");
    void prefillSavedAddress();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleNoticeAccepted(value: boolean) {
    setNoticeAccepted(value);
    setNoticeAcceptedAt(value ? new Date().toISOString() : null);
  }

  /**
   * Writes the address to the profile before moving on, so it is kept even if
   * the customer abandons the wizard at the slot or confirm step.
   *
   * Deliberately does not block the transition. Saving an address is a
   * convenience, and making someone wait on it to reach the services list would
   * be trading a real speedup for a background write nobody is watching. The
   * outcome is recorded and reported on the success step instead.
   */
  function persistAddress() {
    const trimmed = addressText.trim();

    if (!isUsableAddress(trimmed) || !coords) return;

    setAddressSaveState("saving");

    void saveAddressAction({
      addressText: trimmed,
      lat: coords.lat,
      lng: coords.lng,
    }).then((result) => {
      // A later success supersedes an earlier failure: the post-booking save is
      // a backstop and may well succeed after this one did not.
      setAddressSaveState(result.ok ? "saved" : "failed");
    });
  }

  async function loadSlots() {
    setLoadingSlots(true);
    setSlotsError(null);

    const result = await listUpcomingSlotsAction();

    setLoadingSlots(false);

    if (!result.ok) {
      setSlotsError(result.message);
      return;
    }

    setUpcomingDays(result.data);
    const firstOpen = result.data.find((day) => day.slots.length > 0);
    if (firstOpen) setSlotDate(firstOpen.dateKey);
  }

  function goToServices() {
    persistAddress();
    setStep("services");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goToSlots() {
    setStep("slot");
    if (!upcomingDays && !loadingSlots) void loadSlots();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function confirmBooking() {
    if (!coords || !slotDate || !slotId || !noticeAcceptedAt) {
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

    // The order is recorded against the pin the customer placed, and the server
    // recomputes the distance from those coordinates. A zero-distance booking
    // is no longer possible: the pin is required before this step is reachable.
    const result = await createBookingAction({
      address: addressText.trim(),
      lat: coords.lat,
      lng: coords.lng,
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
      addressText: addressText.trim(),
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
            prefilled={Boolean(addressText) && !addressEdited}
            loadingSaved={addressLoading}
            noticeAccepted={noticeAccepted}
            notes={notes}
            onAddressText={handleAddressText}
            onCoords={handleCoords}
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
            upcomingDays={upcomingDays}
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
            slotDate={slotDate ?? ""}
            slotLabel={selectedSlot?.label ?? ""}
            submitting={submitting}
            error={confirmError}
            onBack={() => setStep("slot")}
            onConfirm={confirmBooking}
          />
        ) : null}

        {step === "success" && summary ? (
          <SuccessStep summary={summary} addressSaveState={addressSaveState} />
        ) : null}
      </div>
    </section>
  );
}
