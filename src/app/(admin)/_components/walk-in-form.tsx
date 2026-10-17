"use client";

import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  Loader2,
  MapPin,
  Minus,
  Plus,
  Search,
  ShoppingBasket,
  Trash2,
  UserRound,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { MapPicker } from "@/app/(public)/book/map-picker";
import { formatFullDate } from "@/app/(public)/book/format";
import type { LatLng, ZoneResult } from "@/app/(public)/book/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isUsableAddress } from "@/lib/address";
import { formatINR } from "@/lib/utils";

import {
  createWalkInOrderAction,
  lookupWalkInCustomerAction,
  type WalkInLookupOutcome,
  type WalkInOrderResult,
} from "../admin/walk-in/actions";

/**
 * The counter form for a walk-in (section 8.11).
 *
 * It is deliberately one screen rather than the wizard's five steps. The wizard
 * steps because a customer booking from a phone should be asked one thing at a
 * time; the counter is the opposite situation - the customer is standing there,
 * the staff member already knows the address, the slot and the basket, and every
 * extra click is time the customer spends waiting. So the order of the sections is
 * the order the conversation happens in, and nothing is hidden behind a step.
 *
 * The map and the 6 km check are not skipped for being a walk-in. A walk-in has a
 * real pickup address like any other order, and the same `book_pickup` call will
 * refuse it a second later if the pin is out of the zone - so checking here is the
 * difference between a red map pin and a wasted form.
 */

type CatalogueItem = { id: string; name: string; unit: string; price: number };
type SlotView = { id: string; label: string; remaining: number };
type SlotDayView = { dateKey: string; isBlocked: boolean; slots: SlotView[] };
type Line = { serviceId: string; name: string; qty: number; unitPrice: number };

function dayLabel(dateKey: string, todayKey: string): string {
  if (dateKey === todayKey) return `Today, ${formatFullDate(dateKey)}`;
  return formatFullDate(dateKey);
}

/** The verdict spelled out, for the cases where "drag the pin" is not enough. */
function ZoneNote({ zone, maxRadiusKm }: { zone: ZoneResult; maxRadiusKm: number }) {
  if (zone.status === "within") return null;

  if (zone.status === "outside") {
    return (
      <p className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
        This pin is about {zone.distanceKm.toFixed(1)} km from the store, beyond
        our {maxRadiusKm} km pickup area.
      </p>
    );
  }

  if (zone.status === "unconfigured") {
    return (
      <p className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
        The store location is not set, so this address cannot be checked.
      </p>
    );
  }

  return (
    <p className="text-destructive flex items-start gap-2 rounded-lg border border-current/30 px-3 py-2 text-sm">
      <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      {zone.message}
    </p>
  );
}

export function WalkInForm({
  todayKey,
  center,
  maxRadiusKm,
  services,
  slotDays,
}: {
  todayKey: string;
  center: LatLng;
  maxRadiusKm: number;
  services: CatalogueItem[];
  slotDays: SlotDayView[];
}) {
  // Only days that can actually take a booking: a blocked date, or a day whose
  // slots have all passed or filled, is not a choice worth offering.
  const bookableDays = React.useMemo(
    () => slotDays.filter((day) => !day.isBlocked && day.slots.length > 0),
    [slotDays],
  );

  const [fullName, setFullName] = React.useState("");
  const [mobile, setMobile] = React.useState("");
  const [lookup, setLookup] = React.useState<WalkInLookupOutcome | null>(null);
  const [lookingUp, setLookingUp] = React.useState(false);
  const [lookupError, setLookupError] = React.useState<string | null>(null);

  const addressInputRef = React.useRef<HTMLInputElement | null>(null);
  const [addressText, setAddressText] = React.useState("");
  const [coords, setCoords] = React.useState<LatLng | null>(null);
  const [zone, setZone] = React.useState<ZoneResult | null>(null);
  const [checking, setChecking] = React.useState(false);

  const [slotDate, setSlotDate] = React.useState(
    () => bookableDays[0]?.dateKey ?? todayKey,
  );
  const [slotId, setSlotId] = React.useState("");

  const [lines, setLines] = React.useState<Line[]>([]);

  const [noticeAccepted, setNoticeAccepted] = React.useState(false);
  const [notes, setNotes] = React.useState("");

  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [placed, setPlaced] = React.useState<WalkInOrderResult | null>(null);

  const daySlots = React.useMemo(
    () => bookableDays.find((day) => day.dateKey === slotDate)?.slots ?? [],
    [bookableDays, slotDate],
  );

  const subtotal = React.useMemo(
    () => lines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0),
    [lines],
  );

  /*
   * Every distance check is numbered. Dragging the map fires a request per drop,
   * and on a slow connection an earlier one can land after a later one; only the
   * newest may write, or the pin ends up labelled with the verdict for a place it
   * is no longer on.
   */
  const checkSeq = React.useRef(0);

  const handleCoords = React.useCallback(async (next: LatLng) => {
    setCoords(next);
    setChecking(true);

    const seq = ++checkSeq.current;

    try {
      const response = await fetch("/api/distance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      });

      if (seq !== checkSeq.current) return;

      setZone((await response.json()) as ZoneResult);
    } catch {
      if (seq !== checkSeq.current) return;
      setZone({
        status: "error",
        message: "We could not check this location. Try again.",
      });
    } finally {
      if (seq === checkSeq.current) setChecking(false);
    }
  }, []);

  async function handleLookup() {
    setLookingUp(true);
    setLookupError(null);

    const result = await lookupWalkInCustomerAction({ mobile });

    setLookingUp(false);

    if (!result.ok) {
      setLookup(null);
      setLookupError(result.message);
      return;
    }

    setLookup(result.data);

    // An existing customer's name comes from their account so the counter sees
    // whose order this is about to become, without retyping it.
    if (result.data.status === "existing" && result.data.fullName) {
      setFullName(result.data.fullName);
    }
  }

  function addService(service: CatalogueItem) {
    setLines((current) => {
      const existing = current.find((line) => line.serviceId === service.id);

      if (existing) {
        return current.map((line) =>
          line.serviceId === service.id ? { ...line, qty: line.qty + 1 } : line,
        );
      }

      return [
        ...current,
        {
          serviceId: service.id,
          name: service.name,
          qty: 1,
          unitPrice: service.price,
        },
      ];
    });
  }

  function setQty(serviceId: string, qty: number) {
    setLines((current) =>
      qty <= 0
        ? current.filter((line) => line.serviceId !== serviceId)
        : current.map((line) =>
            line.serviceId === serviceId ? { ...line, qty } : line,
          ),
    );
  }

  function reset() {
    setFullName("");
    setMobile("");
    setLookup(null);
    setLookupError(null);
    setAddressText("");
    setCoords(null);
    setZone(null);
    setSlotDate(bookableDays[0]?.dateKey ?? todayKey);
    setSlotId("");
    setLines([]);
    setNoticeAccepted(false);
    setNotes("");
    setError(null);
    setPlaced(null);
  }

  /*
   * The first unmet requirement, so the button always explains itself rather
   * than being a grey rectangle with no reason.
   */
  const blocker = placed
    ? null
    : !fullName.trim() || fullName.trim().length < 2
      ? "Enter the customer's name."
      : mobile.trim().length === 0
        ? "Enter the customer's mobile number."
        : lookup?.status === "staff"
          ? "That number belongs to a staff account."
          : !isUsableAddress(addressText)
            ? "Add the pickup address, then place the pin."
            : coords === null
              ? "Drag the map so the pin sits on the pickup address."
              : checking
                ? "Checking the address..."
                : zone?.status === "outside"
                  ? `That address is outside our ${maxRadiusKm} km pickup area.`
                  : zone?.status === "unconfigured"
                    ? "The store location is not set, so the address cannot be checked."
                    : zone?.status === "error"
                      ? "The address could not be checked. Try again."
                      : slotId === ""
                        ? "Choose a pickup slot."
                        : lines.length === 0
                          ? "Add at least one service."
                          : !noticeAccepted
                            ? "Tick the box to confirm the pickup area."
                            : null;

  const canSubmit = blocker === null && !submitting;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!coords || !canSubmit) return;

    setSubmitting(true);
    setError(null);

    const result = await createWalkInOrderAction({
      fullName: fullName.trim(),
      mobile,
      address: addressText,
      lat: coords.lat,
      lng: coords.lng,
      notes: notes.trim(),
      slotDate,
      slotId,
      // The counter ticked the box on the customer's behalf, in front of them.
      zoneNoticeAcceptedAt: new Date().toISOString(),
      items: lines,
    });

    setSubmitting(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    setPlaced(result.data);
  }

  if (placed) {
    return (
      <Card className="border-primary/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="text-primary size-5" aria-hidden />
            Walk-in booked
          </CardTitle>
          <CardDescription>
            {placed.customerCreated
              ? `A new customer account was created for ${placed.customerName}.`
              : `Booked against the existing account for ${placed.customerName}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="font-mono text-lg font-semibold">{placed.orderNo}</p>

          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href={`/admin/bookings/${placed.orderId}`}>
                Open this booking
              </Link>
            </Button>
            <Button type="button" variant="outline" onClick={reset}>
              Take another walk-in
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Customer */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserRound className="size-4" aria-hidden />
            Customer
          </CardTitle>
          <CardDescription>
            The mobile number decides whether this is a new account or a returning
            customer.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="walk-in-name">Name</Label>
              <Input
                id="walk-in-name"
                autoComplete="off"
                placeholder="Customer name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="walk-in-mobile">Mobile</Label>
              <div className="flex gap-2">
                <Input
                  id="walk-in-mobile"
                  type="tel"
                  autoComplete="off"
                  placeholder="10 digit mobile number"
                  value={mobile}
                  onChange={(event) => {
                    setMobile(event.target.value);
                    setLookup(null);
                    setLookupError(null);
                  }}
                  onBlur={() => {
                    if (mobile.trim()) void handleLookup();
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleLookup}
                  disabled={lookingUp || mobile.trim().length === 0}
                >
                  {lookingUp ? (
                    <Loader2 className="animate-spin" aria-hidden />
                  ) : (
                    <Search aria-hidden />
                  )}
                  Check
                </Button>
              </div>
            </div>
          </div>

          {lookupError ? (
            <p className="text-destructive text-sm">{lookupError}</p>
          ) : null}

          {lookup?.status === "existing" ? (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <Check className="text-primary size-4" aria-hidden />
              Existing customer — booking under{" "}
              <strong>{lookup.fullName}</strong>, the name on the account.
            </p>
          ) : null}

          {lookup?.status === "new" ? (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <Plus className="size-4" aria-hidden />
              New number — an account will be created for this customer.
            </p>
          ) : null}

          {lookup?.status === "staff" ? (
            <p className="text-destructive flex items-center gap-2 text-sm">
              <AlertTriangle className="size-4" aria-hidden />
              That number belongs to a staff account. Enter the customer&apos;s
              own number.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* Address */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="size-4" aria-hidden />
            Pickup address
          </CardTitle>
          <CardDescription>
            Same {maxRadiusKm} km zone as an online booking.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border-border has-[:focus-within]:border-ring has-[:focus-within]:ring-ring/30 overflow-hidden rounded-xl border transition-colors has-[:focus-within]:ring-2">
            <div className="bg-background/60 border-border flex items-center gap-2 border-b px-3">
              <Search className="text-muted-foreground size-4 shrink-0" aria-hidden />
              <Input
                id="walk-in-address"
                ref={addressInputRef}
                autoComplete="off"
                placeholder="Flat / house no, street, area, pin code"
                value={addressText}
                onChange={(event) => setAddressText(event.target.value)}
                className="h-11 flex-1 rounded-none border-0 px-0 shadow-none focus-visible:border-0 focus-visible:ring-0"
              />
            </div>

            <MapPicker
              className="rounded-none border-0"
              center={center}
              value={coords}
              onChange={handleCoords}
              onAddressResolved={setAddressText}
              inputRef={addressInputRef}
              maxRadiusKm={maxRadiusKm}
              zone={zone}
              checking={checking}
            />
          </div>

          {zone ? <ZoneNote zone={zone} maxRadiusKm={maxRadiusKm} /> : null}
        </CardContent>
      </Card>

      {/* Slot */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="size-4" aria-hidden />
            Pickup slot
          </CardTitle>
          <CardDescription>
            The same slots and capacity as an online booking.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {bookableDays.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No slots are open yet. Set them up on the Slots page.
            </p>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="walk-in-date">Date</Label>
                <Select
                  value={slotDate}
                  onValueChange={(next) => {
                    setSlotDate(next);
                    setSlotId("");
                  }}
                >
                  <SelectTrigger id="walk-in-date" className="w-full sm:w-72">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {bookableDays.map((day) => (
                      <SelectItem key={day.dateKey} value={day.dateKey}>
                        {dayLabel(day.dateKey, todayKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Available times</legend>
                <div className="flex flex-wrap gap-2">
                  {daySlots.map((slot) => {
                    const active = slot.id === slotId;

                    return (
                      <button
                        key={slot.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setSlotId(slot.id)}
                        className={
                          active
                            ? "border-primary bg-primary text-primary-foreground rounded-full border px-3 py-1.5 text-sm font-medium"
                            : "border-border hover:bg-accent hover:text-accent-foreground rounded-full border px-3 py-1.5 text-sm"
                        }
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <Clock className="size-3.5" aria-hidden />
                          {slot.label}
                          <span className="tabular-nums opacity-70">
                            ({slot.remaining} left)
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            </>
          )}
        </CardContent>
      </Card>

      {/* Services */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShoppingBasket className="size-4" aria-hidden />
            Services
          </CardTitle>
          <CardDescription>
            Tap a service to add it; adjust the quantity below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {services.map((service) => (
              <button
                key={service.id}
                type="button"
                onClick={() => addService(service)}
                className="border-border hover:border-primary/60 hover:bg-accent rounded-lg border px-3 py-2 text-left text-sm transition-colors"
              >
                <span className="block font-medium">{service.name}</span>
                <span className="text-muted-foreground text-xs">
                  {formatINR(service.price)} / {service.unit}
                </span>
              </button>
            ))}
          </div>

          {lines.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No services added yet.
            </p>
          ) : (
            <ul className="divide-border divide-y">
              {lines.map((line) => (
                <li
                  key={line.serviceId}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{line.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {formatINR(line.unitPrice)} each
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      aria-label={`Remove one ${line.name}`}
                      onClick={() => setQty(line.serviceId, line.qty - 1)}
                    >
                      <Minus aria-hidden />
                    </Button>
                    <span className="w-8 text-center text-sm tabular-nums">
                      {line.qty}
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      aria-label={`Add one ${line.name}`}
                      onClick={() => setQty(line.serviceId, line.qty + 1)}
                    >
                      <Plus aria-hidden />
                    </Button>
                    <span className="w-20 text-right text-sm font-medium tabular-nums">
                      {formatINR(line.qty * line.unitPrice)}
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Remove ${line.name}`}
                      onClick={() => setQty(line.serviceId, 0)}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {lines.length > 0 ? (
            <div className="border-border flex items-center justify-between border-t pt-3 text-sm">
              <span className="text-muted-foreground">
                Subtotal, before delivery
              </span>
              <span className="text-base font-semibold tabular-nums">
                {formatINR(subtotal)}
              </span>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Confirm */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Confirm</CardTitle>
          <CardDescription>
            The bill is raised from the admin billing page, not here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="walk-in-notes">Note for the driver (optional)</Label>
            <Textarea
              id="walk-in-notes"
              placeholder="Gate code, landmark, anything helpful."
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>

          <label
            className={
              noticeAccepted
                ? "border-primary/50 bg-primary/5 flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 text-sm transition-colors"
                : "border-border flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 text-sm transition-colors"
            }
          >
            <input
              type="checkbox"
              className="mt-0.5 size-4 shrink-0"
              checked={noticeAccepted}
              onChange={(event) => setNoticeAccepted(event.target.checked)}
            />
            <span>
              The customer understands pickup and delivery is available only
              within {maxRadiusKm} km driving distance of the store.
            </span>
          </label>

          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}

          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button type="submit" disabled={!canSubmit} className="sm:min-w-48">
              {submitting ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <Check aria-hidden />
              )}
              Book walk-in
            </Button>

            {blocker ? (
              <p className="text-muted-foreground text-xs sm:text-right">
                {blocker}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
