"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Check,
  Copy,
  Layers,
  Loader2,
  Plus,
  ReceiptText,
  RotateCcw,
  Shirt,
  Sparkles,
  Trash2,
  Truck,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BillableOrder } from "@/db/queries/billing";
import type { CategorySlug } from "@/lib/pricing";
import { deliveryChargeFor, type DeliveryPolicy } from "@/lib/invoice";
import {
  catalogueGroups,
  catalogueSections,
  categoryForSpeed,
  defaultGroupForBooking,
  detectBookingSpeed,
  findOptionByName,
  type PricedOption,
  type PricingCatalogPair,
} from "@/lib/pricing-options";
import { formatINR } from "@/lib/utils";

import { siteConfig } from "@/config/site";

import { generateBookingInvoiceAction } from "../admin/bookings/actions";

/**
 * The invoice form for a booking card.
 *
 * Four things make this its own form rather than the Billing page's:
 *
 * - The services are the store's actual price list (the `pricing_*` tables, as
 *   Regular and Express, identical to what the customer saw on Book Now), not
 *   the admin catalogue, because online bookings carry those items and no
 *   catalogue row behind them.
 * - There is no speed toggle here. Which list prices the form is detected from
 *   the booking itself: a line quoted at the Regular figure point at Regular,
 *   at the Express multiple at Express. The detected speed loads matching
 *   prices only, so one booking's invoice never blends the two lists.
 * - Each line's unit price is editable: the store confirms what washing
 *   requires, and the edited figure is what gets billed. Delivery comes from
 *   the store policy instead — free at or above the threshold, the flat charge
 *   below — and is never a typed field.
 * - The service the customer originally chose stays on every overridden line as
 *   a reference, so billing a more suitable service never erases what the
 *   booking asked for.
 */

/** The service category dropdown offers one price-list subcategory at a time. */
type GroupSlug = string;

type DraftLine = {
  key: string;
  /** The name being billed (a price-list name or the booked one). */
  name: string;
  /** The name and price the booking recorded, kept as the customer's reference. */
  bookedName: string;
  bookedPrice: number;
  qty: number;
  unitPrice: number;
  /** Set when the line names an option from the detected list. */
  catalogueKey: string | null;
  /** Whether the admin bills something other than the booked service. */
  overridden: boolean;
};

let nextKey = 0;
function lineKey() {
  nextKey += 1;
  return `line-${nextKey}`;
}

/** Radix reserves the empty string, so unset has a sentinel value. */
const UNPICKED = "__none__";

export function BookingInvoiceForm({
  order,
  pricing,
  bookedLines,
  feedback,
  onGenerated,
  onCancel,
}: {
  order: BillableOrder;
  /**
   * The price list pair, read from the database by the page for this request,
   * so the form quotes the same figures /pricing shows today.
   */
  pricing: PricingCatalogPair;
  /** The services the booking itself recorded, opening the line-up. */
  bookedLines: Array<{
    name: string;
    qty: number;
    unitPrice: number;
  }>;
  /** The analysis findings recorded on the booking, or null. */
  feedback: string | null;
  /**
   * Fired once the server has saved the invoice. The dialog stays open showing
   * the secure link; the caller updates the list behind it and closes by way
   * of `onCancel`.
   */
  onGenerated: (invoiceNo: string, payUrl: string | null) => void;
  onCancel: () => void;
}) {
  /*
   * The speed is read from what the booking recorded, once. There is no toggle:
   * Regular and Express are the same items at different figures, and the
   * booking's quoted prices are the record of which one the customer chose.
   */
  const speed = useMemo<CategorySlug>(
    () => detectBookingSpeed(pricing, bookedLines),
    [pricing, bookedLines],
  );

  const activeCategory = useMemo(
    () => categoryForSpeed(pricing, speed),
    [pricing, speed],
  );
  const speedSections = useMemo(() => catalogueSections(activeCategory), [activeCategory]);
  const speedGroups = useMemo(() => catalogueGroups(activeCategory), [activeCategory]);

  /** The option that a line can bill from, keyed as "<speed>/<group>/…". */
  const optionsByKey = useMemo(
    () =>
      new Map(
        speedSections
          .flatMap((section) => section.options)
          .map((option) => [option.key, option]),
      ),
    [speedSections],
  );

  const [groupSlug, setGroupSlug] = useState<GroupSlug>(() =>
    defaultGroupForBooking(pricing, bookedLines, speed),
  );

  const [lines, setLines] = useState<DraftLine[]>(() =>
    bookedLines.map((line) => {
      const option = findOptionByName(pricing, line.name, speed);

      return {
        key: lineKey(),
        name: line.name,
        bookedName: line.name,
        bookedPrice: line.unitPrice,
        qty: line.qty,
        unitPrice: line.unitPrice,
        catalogueKey: option?.key ?? null,
        overridden: false,
      };
    }),
  );

  const [feedbackText, setFeedbackText] = useState(feedback ?? "");
  const [error, setError] = useState<string | null>(null);
  /* The receipt the server returned, carrying the secure invoice link. */
  const [generated, setGenerated] = useState<{
    invoiceNo: string;
    payUrl: string | null;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  /** Only the selected category's options — the dropdown filters the list. */
  const section = useMemo(
    () =>
      speedSections.find((entry) => entry.slug === groupSlug) ??
      speedSections[0] ??
      null,
    [speedSections, groupSlug],
  );
  const options = section?.options ?? [];

  const policy: DeliveryPolicy = siteConfig.deliveryPolicy;
  const subtotal = lines.reduce(
    (sum, line) => sum + line.qty * line.unitPrice,
    0,
  );
  const delivery = deliveryChargeFor(subtotal, policy);
  const total = subtotal + delivery;

  /** The price-list option a line currently bills from, inside this list. */
  function findOptionStored(line: DraftLine): PricedOption | null {
    return line.catalogueKey
      ? (optionsByKey.get(line.catalogueKey) ?? null)
      : null;
  }

  function pickOption(key: string, next: string) {
    setLines(
      lines.map((line) => {
        if (line.key !== key) return line;

        if (next === UNPICKED) return line;

        if (next.startsWith("booked:")) {
          // "As booked" puts back exactly what the booking recorded.
          return {
            ...line,
            name: line.bookedName,
            unitPrice: line.bookedPrice,
            catalogueKey:
              findOptionByName(pricing, line.bookedName, speed)?.key ?? null,
            overridden: false,
          };
        }

        const option = optionsByKey.get(next);
        if (!option) return line;

        // A deliberate pick bills that option at its list price; further edits
        // are the admin's from there.
        return {
          ...line,
          name: option.name,
          unitPrice: option.price,
          catalogueKey: option.key,
          overridden: option.name !== line.bookedName,
        };
      }),
    );
  }

  function addLine() {
    const first = options[0];
    setLines([
      ...lines,
      {
        key: lineKey(),
        name: first?.name ?? "",
        bookedName: "",
        bookedPrice: first?.price ?? 0,
        qty: 1,
        unitPrice: first?.price ?? 0,
        catalogueKey: first?.key ?? null,
        overridden: false,
      },
    ]);
  }

  function removeLine(key: string) {
    setLines(lines.filter((line) => line.key !== key));
  }

  function restoreBooked(key: string) {
    setLines(
      lines.map((line) => {
        if (line.key !== key || !line.bookedName) return line;

        return {
          ...line,
          name: line.bookedName,
          unitPrice: line.bookedPrice,
          catalogueKey:
            findOptionByName(pricing, line.bookedName, speed)?.key ?? null,
          overridden: false,
        };
      }),
    );
  }

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines(
      lines.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await generateBookingInvoiceAction({
        orderId: order.id,
        items: lines.map((line) => ({
          name: line.name,
          qty: line.qty,
          unitPrice: line.unitPrice,
        })),
        feedback: feedbackText.trim() || undefined,
      });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      setGenerated({
        invoiceNo: result.invoiceNo ?? "Invoice",
        payUrl: result.payUrl ?? null,
      });
      onGenerated(result.invoiceNo ?? "Invoice", result.payUrl ?? null);
    });
  }

  function copyGeneratedLink() {
    if (!generated?.payUrl || typeof window === "undefined") return;

    const origin = window.location.origin;
    const href = `${origin}${generated.payUrl}`;

    // A guarded fallback rather than a bare call: some preview contexts (plain
    // HTTP hosts) do not implement the async clipboard API, and a copy that
    // cannot happen should never become an unhandled rejection.
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(href).then(() => setCopied(true));
      return;
    }

    const target = document.activeElement;
    if (target instanceof HTMLInputElement) {
      target.select();
      setCopied(document.execCommand("copy"));
    }
  }

  /** Options for one line: the selected category's services plus "As booked". */
  function lineOptionsFor(line: DraftLine) {
    const booked = !findOptionStored(line);

    return (
      <SelectContent>
        <SelectGroup>
          <SelectLabel className="text-muted-foreground">
            {section?.name ?? "Services"}
          </SelectLabel>
          {options.map((option) => (
            <SelectItem key={option.key} value={option.key}>
              {option.display} — {formatINR(option.price)}/{option.unit}
            </SelectItem>
          ))}
        </SelectGroup>

        {booked ? (
          <SelectGroup>
            <SelectLabel className="text-muted-foreground">As booked</SelectLabel>
            <SelectItem value={`booked:${line.key}`}>
              {line.bookedName || line.name} — {formatINR(line.bookedPrice)}
            </SelectItem>
          </SelectGroup>
        ) : null}
      </SelectContent>
    );
  }

  const speedLabel = speed === "express" ? "Express" : "Regular";

  if (generated) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-col items-center gap-2.5 py-2 text-center">
            <span className="bg-primary text-primary-foreground grid size-12 place-items-center rounded-full shadow-sm">
              <Check className="size-6" aria-hidden />
            </span>
            <p className="text-base font-semibold">
              {generated.invoiceNo} generated
            </p>
            <p className="text-muted-foreground max-w-sm text-xs">
              The secure link is live. Send it from the booking card — once sent
              it also appears on the customer&apos;s booking.
            </p>
          </div>

          {generated.payUrl ? (
            <div className="bg-card space-y-1.5 rounded-xl border p-3.5">
              <Label htmlFor={`invoice-link-${order.id}`}>
                Secure invoice link
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id={`invoice-link-${order.id}`}
                  value={`${typeof window === "undefined" ? "" : window.location.origin}${generated.payUrl}`}
                  readOnly
                  onFocus={(event) => event.currentTarget.select()}
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Copy the secure invoice link"
                  onClick={copyGeneratedLink}
                >
                  {copied ? (
                    <Check className="text-primary" aria-hidden />
                  ) : (
                    <Copy aria-hidden />
                  )}
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="border-border bg-card flex shrink-0 justify-end border-t px-5 py-3">
          <Button type="button" onClick={onCancel}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      {/*
        The scroll body: every section is one card, and the totals plus the
        action buttons stay pinned in the footer below it, so the dialog itself
        never grows past the viewport.
      */}
      <div className="border-border min-h-0 flex-1 space-y-3.5 overflow-y-auto border-b bg-muted/30 px-5 py-4">
        <BookingContextCard order={order} speedLabel={speedLabel} speed={speed} />

        <section className="bg-card space-y-2 rounded-xl border p-3.5 shadow-xs">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="bg-primary/12 text-primary grid size-5 shrink-0 place-items-center rounded-md"
            >
              <Layers className="size-3" />
            </span>
            <Label htmlFor={`category-${order.id}`}>Service category</Label>
          </div>
          <Select
            value={section?.slug ?? groupSlug}
            onValueChange={setGroupSlug}
          >
            <SelectTrigger id={`category-${order.id}`} className="w-full">
              <SelectValue placeholder="Choose a category" />
            </SelectTrigger>
            <SelectContent>
              {speedGroups.map((group) => (
                <SelectItem key={group.slug} value={group.slug}>
                  {group.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">
            Only the services and prices under the chosen category are shown.
          </p>
        </section>

        <div className="space-y-2.5">
          {lines.map((line, index) => {
            const option = findOptionStored(line);

            return (
              <div
                key={line.key}
                className="bg-card space-y-3 rounded-xl border p-3.5 shadow-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="inline-flex items-center gap-2 text-sm font-medium">
                      <span
                        aria-hidden
                        className="bg-primary text-primary-foreground grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold tabular-nums"
                      >
                        {index + 1}
                      </span>
                      <span className="truncate">
                        {line.name || "Unset service"}
                      </span>
                    </span>
                    <span className="text-muted-foreground mt-0.5 block text-xs">
                      {option
                        ? `${formatINR(option.price)}/${option.unit} list price`
                        : "As booked — not on the price list"}
                    </span>
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove service ${index + 1}`}
                    onClick={() => removeLine(line.key)}
                    disabled={isPending}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>

                <Select
                  value={option ? option.key : `booked:${line.key}`}
                  onValueChange={(next) => pickOption(line.key, next)}
                >
                  <SelectTrigger
                    id={`line-${line.key}`}
                    className="w-full"
                    aria-label={`Service ${index + 1}`}
                  >
                    <SelectValue placeholder="Choose a service" />
                  </SelectTrigger>
                  {lineOptionsFor(line)}
                </Select>

                {/*
                  The customer's original pick stays on the line until (and after)
                  the admin bills something more suitable, and one tap restores it.
                */}
                {line.overridden && line.bookedName ? (
                  <button
                    type="button"
                    onClick={() => restoreBooked(line.key)}
                    disabled={isPending}
                    className="border-primary/30 bg-primary/5 hover:bg-primary/10 flex items-center gap-1.5 rounded-full border border-dashed px-2.5 py-1 text-xs transition-colors"
                  >
                    <RotateCcw className="text-primary size-3" aria-hidden />
                    Customer selected {line.bookedName} —{" "}
                    {formatINR(line.bookedPrice)} · restore
                  </button>
                ) : null}

                <div className="grid grid-cols-3 items-end gap-2">
                  <div className="space-y-1.5">
                    <Label htmlFor={`qty-${line.key}`}>Qty</Label>
                    <Input
                      id={`qty-${line.key}`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.5"
                      value={line.qty}
                      disabled={isPending}
                      onChange={(event) =>
                        updateLine(line.key, {
                          qty: Number(event.target.value),
                        })
                      }
                      className="text-right tabular-nums"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor={`price-${line.key}`}>Price (₹)</Label>
                    <Input
                      id={`price-${line.key}`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={line.unitPrice}
                      disabled={isPending}
                      onChange={(event) =>
                        updateLine(line.key, {
                          unitPrice: Number(event.target.value),
                        })
                      }
                      className="text-right tabular-nums"
                    />
                  </div>

                  <div className="text-right">
                    <span className="text-muted-foreground block text-xs">
                      Line total
                    </span>
                    <span className="text-sm font-medium tabular-nums">
                      {formatINR(line.qty * line.unitPrice)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}

          {lines.length === 0 ? (
            <p className="text-card-foreground/70 bg-card rounded-xl border border-dashed px-3.5 py-3 text-sm">
              The booking recorded no services. Add the ones below.
            </p>
          ) : null}

          <button
            type="button"
            onClick={addLine}
            disabled={isPending || options.length === 0}
            className="border-primary/40 hover:bg-primary/5 text-foreground flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
          >
            <Plus className="text-primary size-4" aria-hidden />
            Add a service
          </button>
        </div>

        <section className="bg-card space-y-2 rounded-xl border p-3.5 shadow-xs">
          <Label
            htmlFor={`invoice-feedback-${order.id}`}
            className="flex items-center gap-2"
          >
            <span
              aria-hidden
              className="bg-primary/12 text-primary grid size-5 shrink-0 place-items-center rounded-md"
            >
              <Shirt className="size-3" />
            </span>
            Analysis feedback (optional)
          </Label>
          <Textarea
            id={`invoice-feedback-${order.id}`}
            value={feedbackText}
            onChange={(event) => setFeedbackText(event.target.value)}
            placeholder="Findings on the items, agreed with the customer"
            rows={3}
            maxLength={500}
            disabled={isPending}
            className="bg-transparent shadow-none"
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-muted-foreground text-xs">
              Prefilled with what the analysis step recorded. Saved with the
              invoice.
            </p>
            <p className="text-muted-foreground shrink-0 text-[11px] tabular-nums">
              {feedbackText.length}/500
            </p>
          </div>
        </section>
      </div>

      {/*
        The pinned footer: live totals and the actions stay on screen however
        long the bill gets.
      */}
      <div className="bg-card shrink-0 px-5 py-3">
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <span className="text-muted-foreground block text-xs">
              Subtotal
            </span>
            <span className="font-medium tabular-nums">
              {formatINR(subtotal)}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground flex items-center gap-1 text-xs">
              <Truck className="size-3" aria-hidden />
              Delivery
            </span>
            <span className="font-medium tabular-nums">
              {delivery === 0 ? "Free" : formatINR(delivery)}
            </span>
          </div>
          <div className="text-right">
            <span className="text-muted-foreground block text-xs">Total</span>
            <span className="bg-primary text-primary-foreground inline-block rounded-lg px-2.5 py-0.5 font-bold tabular-nums">
              {formatINR(total)}
            </span>
          </div>
        </div>
        <p className="text-muted-foreground mt-1.5 text-[11px]">
          {delivery === 0
            ? `Free delivery at this subtotal (above ${formatINR(policy.freeAboveInr)}).`
            : `Standard ${formatINR(policy.chargeInr)} delivery below ${formatINR(policy.freeAboveInr)}.`}
        </p>

        {error ? (
          <p role="alert" className="text-destructive mt-1.5 text-xs">
            {error}
          </p>
        ) : null}

        <div className="mt-2.5 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isPending || lines.length === 0}>
            {isPending ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <ReceiptText aria-hidden />
            )}
            Generate invoice
          </Button>
        </div>
      </div>
    </form>
  );
}

/**
 * The booking's identity card at the top of the body: who is being billed, at
 * which auto-detected speed. Solid lime on the number and badge keeps the
 * contrast above WCAG on both light and dark panels.
 */
function BookingContextCard({
  order,
  speedLabel,
  speed,
}: {
  order: {
    order_no: string;
    customer_name: string;
  };
  speedLabel: string;
  speed: CategorySlug;
}) {
  return (
    <div className="border-primary/20 from-primary/12 relative flex items-center gap-3 overflow-hidden rounded-xl border bg-gradient-to-br via-secondary/50 to-transparent p-3.5">
      <span
        aria-hidden
        className="bg-primary/25 pointer-events-none absolute -top-6 -right-6 size-20 rounded-full blur-xl"
      />
      <span className="bg-primary text-primary-foreground grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold">
        {order.customer_name.slice(0, 2).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">
          {order.customer_name}
        </p>
        <p className="text-muted-foreground truncate font-mono text-xs">
          {order.order_no}
        </p>
      </div>
      <span className="bg-primary text-primary-foreground inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold">
        {speed === "express" ? (
          <Zap className="size-3" aria-hidden />
        ) : (
          <Sparkles className="size-3" aria-hidden />
        )}
        {speedLabel} list
      </span>
    </div>
  );
}
