"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, MapPin, Package, ReceiptText } from "lucide-react";

import {
  GlassCard,
  StatusPill,
  toneForStatus,
} from "@/components/account/glass";
import { OrderTimeline } from "@/components/order-timeline";
import type { OrderInvoiceView } from "@/db/queries/billing";
import type { Order, OrderStatusHistory } from "@/db/types";
import { CUSTOMER_STATUS_LABEL, type OrderStatus } from "@/lib/order-status";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

type Booking = Order & {
  slotLabel?: string;
  /** The booking's invoice, when one has been generated for it. */
  invoice?: OrderInvoiceView;
};

const FILTERS = [
  { id: "all", label: "All" },
  { id: "active", label: "In progress" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

function matchesFilter(status: OrderStatus, filter: FilterId) {
  if (filter === "all") return true;
  if (filter === "cancelled") return status === "cancelled";
  if (filter === "completed") return status === "delivered";
  return status !== "cancelled" && status !== "delivered";
}

/**
 * The customer's bookings, with tracking expanded in place.
 *
 * A client component because the filter chips and the per-order expand state
 * live here; the server page does the three queries and hands over plain data.
 */
export function OrderTrackingList({
  orders,
  invoices,
  history,
  trackedOrderId,
}: {
  orders: Booking[];
  /** Each booking's invoice, keyed by order id — what the cards link with. */
  invoices: Record<string, OrderInvoiceView>;
  history: Record<string, OrderStatusHistory[]>;
  /**
   * The order a notification deep-linked to, if any.
   *
   * Its timeline starts open and the card is scrolled into view, so tapping a
   * message in the bell lands on that booking rather than on a list the customer
   * then has to search through.
   */
  trackedOrderId?: string | null;
}) {
  const [filter, setFilter] = useState<FilterId>("all");
  const [openId, setOpenId] = useState<string | null>(trackedOrderId ?? null);

  const listRef = useRef<HTMLUListElement | null>(null);

  /*
   * Bring the tracked order into view once, on arrival.
   *
   * A `useEffect` keyed on the id rather than on a ref set inside render: the
   * list has to be mounted and laid out before `scrollIntoView` means anything,
   * and scrolling is a side effect on the DOM rather than derived state.
   *
   * `behavior: "smooth"` would animate behind a page the customer has only just
   * arrived at, which reads as the page moving on its own; `auto" jumps there.
   */
  useEffect(() => {
    if (!trackedOrderId) return;

    const target = document.getElementById(`order-${trackedOrderId}`);

    // Guarded rather than optional-chained: jsdom does not implement
    // `scrollIntoView`, so a bare call would throw there, and a scroll that
    // cannot happen should leave the list exactly as it renders rather than
    // taking the page down with it. The booking is still expanded either way.
    if (typeof target?.scrollIntoView === "function") {
      target.scrollIntoView({ block: "center", behavior: "auto" });
    }
  }, [trackedOrderId]);

  const visible = orders.filter((order) =>
    matchesFilter(order.status as OrderStatus, filter),
  );

  function invoiceFor(order: Booking): OrderInvoiceView | undefined {
    return order.invoice ?? invoices[order.id];
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((option) => {
          const active = filter === option.id;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setFilter(option.id);
                // Changing the filter drops the expansion, so the deep-linked
                // order is not left open behind a chip that hides it.
                setOpenId(null);
              }}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-[var(--uc-lime-500)] text-[var(--uc-green-900)] shadow-[var(--uc-shadow-sm)]"
                  : "bg-[var(--uc-glass-strong)] text-[var(--uc-green-800)] hover:bg-[color-mix(in_oklab,var(--uc-lime-500),transparent_75%)]",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <GlassCard className="text-center">
          <Package
            className="mx-auto mb-3 size-8 text-[var(--uc-lime-600)]"
            aria-hidden="true"
          />
          <p className="font-medium">Nothing here yet</p>
          <p className="text-muted-foreground mt-1 text-sm">
            {orders.length === 0
              ? "Book a pickup and it will show up here."
              : "No orders match this filter."}
          </p>
        </GlassCard>
      ) : (
        <ul className="space-y-4" ref={listRef}>
          {visible.map((order, index) => {
            const status = order.status as OrderStatus;
            const expanded = openId === order.id;
            const isTracked = order.id === trackedOrderId;

            return (
              // Anchored so a deep link from the notification bell can scroll
              // to this exact card.
              <li key={order.id} id={`order-${order.id}`}>
                <GlassCard
                  className={cn(
                    "uc-fade-up",
                    // A ring on the order that was tapped, so the eye lands on
                    // the right card in a list that can be long.
                    isTracked &&
                      "ring-2 ring-[var(--uc-lime-600)] ring-offset-2 ring-offset-transparent",
                  )}
                  style={{ animationDelay: `${Math.min(index, 6) * 60}ms` }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-muted-foreground font-mono text-xs tracking-wide">
                        {order.order_no}
                      </p>
                      <p className="mt-1 font-medium">
                        {formatDate(order.pickup_slot_date)}
                        {order.slotLabel ? (
                          <span className="text-muted-foreground font-normal">
                            {" · "}
                            {order.slotLabel}
                          </span>
                        ) : null}
                      </p>
                    </div>

                    <StatusPill tone={toneForStatus(status)}>
                      {CUSTOMER_STATUS_LABEL[status]}
                    </StatusPill>
                  </div>

                  <p className="text-muted-foreground mt-3 flex items-start gap-2 text-sm">
                    <MapPin
                      className="mt-0.5 size-4 shrink-0"
                      aria-hidden="true"
                    />
                    <span>{order.address_snapshot}</span>
                  </p>

                  {/*
                    The booking's invoice, once generated: a draft says the
                    paperwork exists, a sent one hands over the same secure link
                    the WhatsApp message carries.
                  */}
                  <InvoiceLine invoice={invoiceFor(order)} />

                  {/*
                    Tracking lives here rather than on a separate page: the
                    timeline is already fetched for the whole list, so opening
                    one costs nothing.
                  */}
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => setOpenId(expanded ? null : order.id)}
                    className="text-primary mt-4 inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
                  >
                    {expanded ? "Hide tracking" : "Track order"}
                    <ChevronDown
                      aria-hidden="true"
                      className={cn(
                        "size-4 transition-transform",
                        expanded && "rotate-180",
                      )}
                    />
                  </button>

                  {expanded ? (
                    <div className="mt-4 border-t border-[var(--uc-divider)] pt-4">
                      <OrderTimeline
                        status={status}
                        history={history[order.id] ?? []}
                      />
                    </div>
                  ) : null}
                </GlassCard>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * The invoice line on a booking card, or nothing before an invoice exists.
 *
 * A draft is announced but not linked: the signed /pay link is minted at
 * generation, but the customer reads the sent invoice through the same link
 * their WhatsApp message carries, so a hold on drafts keeps the card and the
 * message telling one story.
 */
function InvoiceLine({ invoice }: { invoice: OrderInvoiceView | undefined }) {
  if (!invoice) return null;

  if (invoice.status === "draft" || !invoice.pay_token) {
    return (
      <div className="mt-3 flex items-center gap-2 border-t border-[var(--uc-divider)] pt-3">
        <ReceiptText
          className="text-muted-foreground size-4"
          aria-hidden="true"
        />
        <span className="text-muted-foreground flex-1 text-sm">
          Invoice{" "}
          <span className="font-mono">{invoice.invoice_no}</span> generated —
          coming to you shortly
        </span>
      </div>
    );
  }

  return (
    <div className="mt-3 flex items-center gap-2 border-t border-[var(--uc-divider)] pt-3">
      <ReceiptText
        className="text-[var(--uc-lime-600)] size-4"
        aria-hidden="true"
      />
      <span className="text-muted-foreground flex-1 text-sm">
        Invoice{" "}
        <span className="font-mono">{invoice.invoice_no}</span>
        {invoice.status === "paid" ? " · paid" : ""}
      </span>
      <Link
        href={`/pay/${invoice.pay_token}`}
        className="text-primary inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
      >
        View invoice
        <ChevronDown className="size-4 -rotate-90" aria-hidden="true" />
      </Link>
    </div>
  );
}
