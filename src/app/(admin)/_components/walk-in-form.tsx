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

import { DatePicker } from "@/app/(public)/book/steps/date-picker";
import { MapPicker } from "@/app/(public)/book/map-picker";
import { formatFullDate } from "@/app/(public)/book/format";
import type { LatLng, ZoneResult } from "@/app/(public)/book/types";
import {
  resolveSelection,
  selectionKey,
  selectionTotal,
  type ServiceSelection,
} from "@/app/(public)/book/service-selection";
import { SpeedToggle } from "@/components/pricing/speed-toggle";
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
  deriveExpressCategory,
  type CategorySlug,
  type PriceCategory,
} from "@/lib/pricing";
import { isUsableAddress } from "@/lib/address";
import { cn, formatPrice } from "@/lib/utils";

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

/**
 * The two long wear groups whose lists are capped to a self-scrolling box, the
 * same set the public price list caps, so the two pages behave the same way in
 * the hand.
 */
const SCROLLABLE_GROUPS: ReadonlySet<string> = new Set([
  "adult-wear",
  "kids-wear",
]);

type SlotView = { id: string; label: string; remaining: number };
type SlotDayView = { dateKey: string; isBlocked: boolean; slots: SlotView[] };

function dayLabel(dateKey: string, todayKey: string): string {
  if (dateKey === todayKey) return `Today, ${formatFullDate(dateKey)}`;
  return formatFullDate(dateKey);
}

/** The verdict spelled out, for the cases where "drag the pin" is not enough. */
function ZoneNote({
  zone,
  maxRadiusKm,
}: {
  zone: ZoneResult;
  maxRadiusKm: number;
}) {
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
  pricing,
  slotDays,
}: {
  todayKey: string;
  center: LatLng;
  maxRadiusKm: number;
  /**
   * The Regular price list, read unchanged from the database by the page, so
   * the counter quotes exactly what /pricing shows. Express is derived here.
   */
  pricing: PriceCategory;
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

  /*
   * The basket is the wizard's selection model, not a local one: a record keyed
   * by "<group>/<item>/<option index>", which is deliberately independent of
   * Regular and Express. Switching the toggle keeps what was tapped and only
   * re-prices it, exactly as the online wizard does.
   */
  const [speed, setSpeed] = React.useState<CategorySlug>("regular");
  const [activeGroup, setActiveGroup] = React.useState(
    () => pricing.groups[0]?.slug ?? "",
  );
  const [selection, setSelection] = React.useState<ServiceSelection>({});

  const activeCategory =
    speed === "express" ? deriveExpressCategory(pricing) : pricing;

  const groups = activeCategory?.groups ?? [];
  const group = groups.find((entry) => entry.slug === activeGroup) ?? groups[0];

  // The two long wear groups cap to a scrolling box, as on the price list.
  const scrollable = group ? SCROLLABLE_GROUPS.has(group.slug) : false;

  const [noticeAccepted, setNoticeAccepted] = React.useState(false);
  const [notes, setNotes] = React.useState("");

  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [placed, setPlaced] = React.useState<WalkInOrderResult | null>(null);

  const daySlots = React.useMemo(
    () => bookableDays.find((day) => day.dateKey === slotDate)?.slots ?? [],
    [bookableDays, slotDate],
  );

  /*
   * The priced basket for the speed currently selected. Tapping the toggle does
   * not change what is in it - the keys do not mention speed - so the same picks
   * come back priced for Express, which is the whole trick of the shared key.
   */
  const lines = React.useMemo(
    () => resolveSelection(activeCategory, selection),
    [activeCategory, selection],
  );

  const subtotal = React.useMemo(() => selectionTotal(lines), [lines]);

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

  /** The counter tapped a row: one more of that item, up to the schema cap. */
  function addService(optionKey: string) {
    setSelection((current) => ({
      ...current,
      [optionKey]: Math.min((current[optionKey] ?? 0) + 1, 99),
    }));
  }

  function setQty(optionKey: string, qty: number) {
    setSelection((current) => {
      const next = { ...current };

      if (qty <= 0) delete next[optionKey];
      else next[optionKey] = Math.min(qty, 99);

      return next;
    });
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
    setSelection({});
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
      /*
       * Lines are named exactly as the online wizard names its own, so a
       * walk-in's invoice reads like any other booking's: "<item>" or
       * "<item> (<option>)". There is no `serviceId` — these lines come from
       * the price list, not the catalogue, and billing already prices
       * service-less lines from the stored figure.
       */
      items: lines.map((line) => ({
        name: line.option ? `${line.item} (${line.option})` : line.item,
        qty: line.qty,
        unitPrice: line.unitPrice,
      })),
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
            The mobile number decides whether this is a new account or a
            returning customer.
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
              <Search
                className="text-muted-foreground size-4 shrink-0"
                aria-hidden
              />
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
                <div className="flex items-center gap-3">
                  <DatePicker
                    days={bookableDays}
                    selectedDate={slotDate}
                    onSelectDate={(next) => {
                      setSlotDate(next);
                      setSlotId("");
                    }}
                  />
                  <span className="text-sm font-medium">
                    {dayLabel(slotDate, todayKey) ?? formatFullDate(slotDate)}
                  </span>
                </div>
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
        <CardHeader className="items-center justify-items-center text-center">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShoppingBasket className="size-4" aria-hidden />
            Services
          </CardTitle>
          <CardDescription>
            Priced exactly as the website lists them. Tap a service to add it;
            adjust the quantities in the basket below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/*
            The counter books from the same price list the customer reads on
            /pricing, so this section is assembled the same way the price list
            is: the Regular/Express capsule toggle, a row of sub-category
            capsules, then the list itself. There is no third source of prices
            for staff to diverge from.
          */}
          <div className="flex justify-center">
            <SpeedToggle category={speed} onChange={setSpeed} />
          </div>

          <div className="space-y-3">
            <p className="text-muted-foreground text-center text-xs font-semibold tracking-wider uppercase">
              Service category
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {groups.map((entry) => {
                const active = entry.slug === group?.slug;

                return (
                  <button
                    key={entry.slug}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setActiveGroup(entry.slug)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                        : "border-border text-muted-foreground hover:bg-accent border",
                    )}
                  >
                    {entry.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/*
            Express is derived from the Regular list rather than quoted
            separately, so say so instead of implying the figures were set
            independently.
          */}
          {activeCategory?.derived ? (
            <p className="border-border bg-muted/40 rounded-lg border p-3 text-sm">
              These prices are {activeCategory.derivedFrom}, with a{" "}
              {activeCategory.turnaround} turnaround.
            </p>
          ) : null}

          {!group ? (
            <p className="text-muted-foreground text-sm">
              No services listed yet.
            </p>
          ) : (
            <div className="mx-auto max-w-2xl space-y-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="font-display text-xl font-bold tracking-tight">
                  {group.name}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {group.items.length} items
                  {group.turnaround ? ` · ready in ${group.turnaround}` : ""}
                </p>
              </div>

              {/*
                One row per priceable service, dressed as a table with the same
                header row and hairline separators as the public list. Every row
                is the button - tapping it bumps that line in the basket below,
                and a row already in the basket carries a count chip beside its
                price. Like the wizard, the variant is fixed at the line's first
                option, so one row is one thing to tap between orders.
              */}
              <div className="border-border relative overflow-hidden rounded-2xl border shadow-sm">
                <div className="hidden grid-cols-[1fr_auto] gap-4 bg-[var(--primary)]/15 px-4 py-2.5 text-xs font-semibold tracking-wider uppercase sm:grid">
                  <span>Service</span>
                  <span className="text-right">Price</span>
                </div>

                {/*
                  Capped groups self-scroll, the way the price list does, so the
                  counter does not gain another page-height list to work around.
                */}
                <ul
                  {...(scrollable
                    ? {
                        tabIndex: 0,
                        role: "region",
                        "aria-label": `${group.name} price list, scroll to see all ${group.items.length} items`,
                      }
                    : {})}
                  className={cn(
                    scrollable &&
                      "focus-visible:outline-ring max-h-[26rem] [scrollbar-width:thin] [scrollbar-color:var(--primary)_transparent] overflow-y-auto overscroll-contain focus-visible:outline-2 focus-visible:outline-offset-[-2px]",
                  )}
                >
                  {group.items.map((item, itemIndex) => {
                    const option = item.options[0];

                    const isLast = itemIndex === group.items.length - 1;

                    if (!option) return null;

                    const optionKey = selectionKey(group.slug, item.slug, 0);
                    const qty = selection[optionKey] ?? 0;

                    return (
                      <li key={item.slug} className="relative">
                        {/*
                          Brand-colour breaker between rows, as on the price
                          list: two hairline gradients fading toward the edges
                          with a lime node at the centre. pointer-events are off
                          so the hairline never steals a tap from the row.
                        */}
                        {!isLast ? (
                          <span
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-x-4 bottom-0 flex items-center gap-2"
                          >
                            <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[var(--primary)]/70" />
                            <span className="size-1.5 rounded-full bg-[var(--primary)] shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary),transparent_80%)]" />
                            <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[var(--primary)]/70" />
                          </span>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => addService(optionKey)}
                          aria-label={`Add ${item.name} to the basket`}
                          className="w-full border-l-2 border-transparent px-4 py-3 text-left transition-colors hover:border-[var(--primary)] hover:bg-[var(--accent)]/40 sm:py-4"
                        >
                          <div className="flex w-full flex-col items-center gap-y-2 text-center sm:grid sm:grid-cols-[1fr_auto] sm:items-center sm:gap-x-6 sm:text-left">
                            <div className="min-w-0">
                              <p className="font-medium">{item.name}</p>
                              {group.turnaround ? (
                                <p className="text-muted-foreground text-xs">
                                  Ready in {group.turnaround}
                                </p>
                              ) : null}
                            </div>

                            <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 sm:justify-end">
                              {qty > 0 ? (
                                <span
                                  aria-label={`${qty} in the basket`}
                                  className="bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-xs font-bold tabular-nums"
                                >
                                  × {qty}
                                </span>
                              ) : null}
                              {option.label ? (
                                <span className="border-border text-muted-foreground rounded-full border px-2 py-0.5 text-xs">
                                  {option.label}
                                </span>
                              ) : null}
                              {option.original > option.price ? (
                                <span className="text-muted-foreground text-sm line-through">
                                  {formatPrice(option.original)}
                                </span>
                              ) : null}
                              <span className="rounded-full bg-[var(--primary)]/15 px-2.5 py-1 whitespace-nowrap">
                                <span className="font-display text-base font-bold tabular-nums">
                                  {formatPrice(option.price)}
                                </span>
                                <span className="text-xs">
                                  {" "}
                                  / {option.unit}
                                </span>
                              </span>
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>

                {scrollable ? (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[var(--background)] to-transparent"
                  />
                ) : null}
              </div>

              {scrollable ? (
                <p className="text-muted-foreground text-center text-xs">
                  Scroll within the list to see all {group.items.length} items.
                </p>
              ) : null}
            </div>
          )}

          {lines.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No services added yet.
            </p>
          ) : (
            <ul className="divide-border divide-y">
              {lines.map((line) => {
                const name = line.option
                  ? `${line.item} (${line.option})`
                  : line.item;

                return (
                  <li
                    key={line.key}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{name}</p>
                      <p className="text-muted-foreground text-xs">
                        {formatPrice(line.unitPrice)} each
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        aria-label={`Remove one ${name}`}
                        onClick={() => setQty(line.key, line.qty - 1)}
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
                        aria-label={`Add one ${name}`}
                        onClick={() => setQty(line.key, line.qty + 1)}
                      >
                        <Plus aria-hidden />
                      </Button>
                      <span className="w-20 text-right text-sm font-medium tabular-nums">
                        {formatPrice(line.qty * line.unitPrice)}
                      </span>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={`Remove ${name}`}
                        onClick={() => setQty(line.key, 0)}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {lines.length > 0 ? (
            <div className="border-border flex items-center justify-between border-t pt-3 text-sm">
              <span className="text-muted-foreground">
                Subtotal, before delivery
              </span>
              <span className="text-base font-semibold tabular-nums">
                {formatPrice(subtotal)}
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
            <Label htmlFor="walk-in-notes">
              Note for the driver (optional)
            </Label>
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
