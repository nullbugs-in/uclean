import type { Metadata } from "next";
import Link from "next/link";

import { GlassCard } from "@/components/account/glass";
import { OrderTrackingList } from "@/components/account/order-tracking-list";
import { listTimeSlots } from "@/db/queries/catalog";
import { readTrackedOrderId } from "@/db/queries/notifications";
import {
  listOrderHistoryForCustomer,
  listOrdersForCustomer,
} from "@/db/queries/orders";
import { createClient } from "@/db/server";
import { requireRoleOrRedirect } from "@/server/auth";

export const metadata: Metadata = { title: "My bookings" };

/**
 * The customer's bookings, newest first, with tracking expanded in place.
 *
 * Three queries, no N+1: the orders, the status history for all of them in one
 * `in (...)` call, and the slot labels. Slot labels read every slot rather than
 * only the active ones, so an order keeps its pickup window after an admin
 * switches that slot off.
 *
 * Distance is deliberately not shown: it is stored as 0 on every order booked
 * while the delivery-zone check is disabled, so it would only read as a fault.
 */
export default async function CustomerOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string | string[] }>;
}) {
  const session = await requireRoleOrRedirect(
    ["customer", "staff", "admin"],
    "/account/orders",
  );
  const supabase = await createClient();

  /*
   * The `?order=` param is how a notification in the bell deep-links to one
   * booking: the tapped message sends the customer here with the id, and the
   * list below expands that order's timeline and scrolls it into view.
   *
   * Validated against the UUID shape rather than passed through, so a truncated
   * or hand-edited value leaves the page exactly as it renders normally instead
   * of hunting for an order that cannot exist.
   */
  const trackedOrderId = readTrackedOrderId((await searchParams).order);

  const [orders, history, slots] = await Promise.all([
    listOrdersForCustomer(supabase, session.profile.id).catch(() => []),
    listOrderHistoryForCustomer(supabase, session.profile.id).catch(() => ({})),
    listTimeSlots(supabase).catch(() => []),
  ]);

  const slotLabels = new Map(slots.map((slot) => [slot.id, slot.label ?? ""]));

  const bookings = orders.map((order) => ({
    ...order,
    slotLabel: slotLabels.get(order.pickup_slot_id) || undefined,
  }));

  return (
    <div className="space-y-8">
      <header className="uc-fade-up flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            My bookings
          </h1>
          <p className="text-muted-foreground mt-2">
            {orders.length === 0
              ? "Your pickups will appear here."
              : `${orders.length} order${orders.length === 1 ? "" : "s"}, newest first.`}
          </p>
        </div>

        <Link
          href="/book"
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--uc-lime-500)] px-4 py-2.5 text-sm font-semibold text-[var(--uc-green-900)] shadow-[var(--uc-shadow-sm)] transition-transform hover:-translate-y-0.5"
        >
          Book a pickup
        </Link>
      </header>

      {orders.length === 0 ? (
        <GlassCard className="uc-fade-up flex flex-col items-center gap-3 py-12 text-center">
          <span
            aria-hidden="true"
            className="grid size-14 place-items-center rounded-2xl bg-[color-mix(in_oklab,var(--uc-lime-500),transparent_70%)]"
          >
            <PackageIcon />
          </span>
          <p className="font-medium">No bookings yet</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            Book your first pickup and you will be able to track it here from
            collection to delivery.
          </p>
          <Link
            href="/book"
            className="mt-1 rounded-xl bg-[var(--uc-lime-500)] px-5 py-2.5 text-sm font-semibold text-[var(--uc-green-900)] shadow-[var(--uc-shadow-sm)] transition-transform hover:-translate-y-0.5"
          >
            Book a pickup
          </Link>
        </GlassCard>
      ) : (
        <OrderTrackingList
          orders={bookings}
          history={history}
          trackedOrderId={trackedOrderId}
        />
      )}
    </div>
  );
}

function PackageIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-7 text-[var(--uc-green-800)]"
      aria-hidden="true"
    >
      <path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z" />
      <path d="M12 22V12" />
      <path d="m3.3 7 7.703 4.734a2 2 0 0 0 1.994 0L20.7 7" />
      <path d="m7.5 4.27 9 5.15" />
    </svg>
  );
}
