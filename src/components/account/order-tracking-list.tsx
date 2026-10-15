"use client";

import { useState } from "react";
import { ChevronDown, MapPin, Package } from "lucide-react";

import {
  GlassCard,
  StatusPill,
  toneForStatus,
} from "@/components/account/glass";
import { OrderTimeline } from "@/components/order-timeline";
import type { Order, OrderStatusHistory } from "@/db/types";
import { CUSTOMER_STATUS_LABEL, type OrderStatus } from "@/lib/order-status";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

type Booking = Order & { slotLabel?: string };

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
  history,
}: {
  orders: Booking[];
  history: Record<string, OrderStatusHistory[]>;
}) {
  const [filter, setFilter] = useState<FilterId>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const visible = orders.filter((order) =>
    matchesFilter(order.status as OrderStatus, filter),
  );

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
        <ul className="space-y-4">
          {visible.map((order, index) => {
            const status = order.status as OrderStatus;
            const expanded = openId === order.id;

            return (
              <li key={order.id}>
                <GlassCard
                  className="uc-fade-up"
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
