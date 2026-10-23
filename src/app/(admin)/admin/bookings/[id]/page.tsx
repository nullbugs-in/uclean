import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  ClipboardList,
  CreditCard,
  Hash,
  MapPin,
  Package,
  Phone,
  Route,
  Sparkles,
  StickyNote,
  Store,
  Truck,
  UserRound,
} from "lucide-react";

import { PanelPage } from "@/components/panel/panel-page";
import { statusProgress } from "@/components/panel/cycle-meter";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/db/server";
import { listPickupAgents } from "@/db/queries/admin-pickups";
import {
  canEditOrderItems,
  getAdminOrderDetail,
} from "@/db/queries/admin-orders";
import { INTERNAL_STATUS_LABEL } from "@/lib/order-status";
import { requireAdmin } from "@/server/auth";
import { formatDate, formatDateTime } from "@/lib/utils";

import { BookingProgressTimeline } from "../../../_components/booking-progress-timeline";
import { BookingStageActions } from "../../../_components/booking-stage-actions";
import { DeliveryAssignmentControl } from "../../../_components/delivery-assignment-control";
import { OrderItemsEditor } from "../../../_components/order-items-editor";
import { OrderStatusLog } from "../../../_components/order-status-log";
import { PickupAssignmentControls } from "../../../_components/pickup-assignment-controls";
import {
  FactTile,
  ProgressStrip,
  SectionCard,
  StatusPill,
} from "../../../_components/booking-detail-cards";

export const metadata: Metadata = { title: "Booking" };

/**
 * One booking in full (architecture doc, section 7.2.4).
 *
 * The page is a stack of cards rather than a definition list, because a single
 * booking carries about fifteen facts and two live controls, and a flat list of
 * that is unreadable at the counter. It reads top to bottom in the order the
 * questions are actually asked: what is this, where is it, who is on it, what
 * happens next, then the record.
 *
 * The progress timeline is not assembled from the current status. It is read from
 * `order_status_history`, which a trigger writes on any change to `orders.status`,
 * so every change made from the buttons here appears in it, and the customer's
 * tracking timeline is built from the same rows. Moving the booking from this page
 * therefore updates what the customer sees with no further work, which is why
 * nothing on this page pushes a notification by hand.
 *
 * A missing booking is a 404 with no explanation, so this screen cannot be used
 * to discover whether an id exists.
 */
export default async function AdminBookingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireAdmin();

  const supabase = await createClient();

  const [booking, agents] = await Promise.all([
    getAdminOrderDetail(supabase, id).catch((error: unknown) => {
      console.error("Could not load the booking", error);
      return null;
    }),
    // The roster is only needed for the assignment controls, and a failed read
    // should not take the whole booking page down with it.
    listPickupAgents(supabase).catch((error: unknown) => {
      console.error("Could not load the agent roster", error);
      return [];
    }),
  ]);

  if (!booking) notFound();

  const gate = canEditOrderItems({
    hasInvoice: booking.hasInvoice,
    status: booking.status,
  });

  const assignablePickup =
    booking.status === "pickup_requested" ||
    booking.status === "agent_assigned";

  return (
    <PanelPage
      title={`Booking ${booking.order_no}`}
      description={`${INTERNAL_STATUS_LABEL[booking.status]} - placed ${formatDateTime(booking.created_at)}`}
      action={
        <Link
          href="/admin/bookings"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden />
          All bookings
        </Link>
      }
    >
      <div className="space-y-6">
        {/*
         * The hero. One card that answers "what is this booking and where is it"
         * before anything is opened, so the page has a single obvious starting
         * point rather than four equally weighted panels.
         */}
        <section className="bg-card overflow-hidden rounded-xl border shadow-sm">
          {/* px-4 on phones, px-6 from sm: stacked on the page's own px-4 the
              fixed 24px gutter left ~296px of content for text and the
              progress strip on a 360px screen. */}
          <div className="bg-muted/40 space-y-4 border-b px-4 py-5 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="font-mono text-xl font-semibold tracking-tight sm:text-2xl">
                    {booking.order_no}
                  </h2>
                  <StatusPill
                    status={booking.status}
                    label={INTERNAL_STATUS_LABEL[booking.status]}
                  />
                  {booking.source === "walk_in" ? (
                    <Badge variant="outline">Walk-in</Badge>
                  ) : null}
                </div>

                <p className="text-muted-foreground text-sm">
                  {booking.customer_name} &middot; {booking.customer_mobile}{" "}
                  &middot; last updated {formatDateTime(booking.updated_at)}
                </p>
              </div>

              <div className="w-full sm:w-64">
                <ProgressStrip
                  status={booking.status}
                  label="Progress"
                  progress={statusProgress(booking.status)}
                />
              </div>
            </div>
          </div>

          <div className="grid gap-3 px-4 py-5 sm:grid-cols-2 sm:px-6 xl:grid-cols-4">
            <FactTile
              icon={CalendarDays}
              label="Scheduled pickup"
              value={formatDate(booking.pickup_slot_date)}
              hint={booking.slotLabel ?? "No slot recorded"}
            />

            <FactTile
              icon={Package}
              label="Services"
              value={
                booking.order_items.length === 0
                  ? "None recorded"
                  : `${booking.order_items.length} line${booking.order_items.length === 1 ? "" : "s"}`
              }
              hint={booking.order_items[0]?.item_name ?? "Nothing added yet"}
            />

            <FactTile
              icon={UserRound}
              label="Pickup agent"
              value={booking.pickupAgent?.fullName ?? "Not assigned"}
              hint={
                booking.pickupAgent
                  ? booking.pickupAgent.automated
                    ? "Assigned automatically"
                    : "Assigned by an admin"
                  : "Nobody is collecting this yet"
              }
            />

            <FactTile
              icon={Truck}
              label="Delivery agent"
              value={booking.deliveryAgent?.fullName ?? "Not assigned"}
              hint={
                booking.deliveryAgent
                  ? "Carrying it out"
                  : "Set once the booking is ready"
              }
            />
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          {/* Working column: where it is, what is in it, and what happened. */}
          <div className="space-y-6">
            <SectionCard
              icon={Route}
              title="Progress"
              description="Read from the status history, so the times shown are when each stage actually happened."
            >
              <BookingProgressTimeline
                order={booking}
                history={booking.order_status_history}
                actorNames={booking.actorNames}
              />
            </SectionCard>

            <SectionCard
              icon={Package}
              title="Services on this booking"
              description="What the customer asked for, adjustable after the bag is weighed."
            >
              <OrderItemsEditor
                orderId={booking.id}
                items={booking.order_items}
                editable={gate.editable}
                lockedReason={gate.reason}
              />
            </SectionCard>

            <SectionCard
              icon={ClipboardList}
              title="Status log"
              description="Every stage change, newest first, written automatically by the database."
            >
              <OrderStatusLog
                history={booking.order_status_history}
                actorNames={booking.actorNames}
              />
            </SectionCard>
          </div>

          {/* Action column: what you can do, then who and where. */}
          <div className="space-y-6">
            <SectionCard
              icon={Sparkles}
              title="Update the stage"
              description="Every move the workflow allows from here. Each one asks you to confirm before it is saved."
            >
              <BookingStageActions
                orderId={booking.id}
                status={booking.status}
              />
            </SectionCard>

            <SectionCard
              icon={UserRound}
              title="Customer"
              action={
                <Avatar size="lg">
                  <AvatarFallback>
                    {initialsOf(booking.customer_name)}
                  </AvatarFallback>
                </Avatar>
              }
            >
              <dl className="space-y-3 text-sm">
                <Row label="Name">{booking.customer_name}</Row>

                <Row label="Mobile">
                  <a
                    href={`tel:${booking.customer_mobile}`}
                    className="inline-flex items-center gap-1.5 underline-offset-4 hover:underline"
                  >
                    <Phone className="size-3.5" aria-hidden />
                    {booking.customer_mobile}
                  </a>
                </Row>

                <Row label="Customer ID">
                  <span className="text-muted-foreground font-mono text-xs break-all">
                    {booking.customer_id}
                  </span>
                </Row>

                <Row label="Source">
                  <span className="capitalize">
                    {booking.source.replace(/_/g, " ")}
                  </span>
                </Row>
              </dl>

              {booking.notes ? (
                <>
                  <Separator className="my-4" />
                  <div className="flex items-start gap-2 text-sm">
                    <StickyNote
                      className="text-muted-foreground mt-0.5 size-4 shrink-0"
                      aria-hidden
                    />
                    <div>
                      <p className="text-muted-foreground text-xs">
                        Notes from the customer
                      </p>
                      <p className="mt-0.5">{booking.notes}</p>
                    </div>
                  </div>
                </>
              ) : null}

              {booking.cancellation_reason ? (
                <>
                  <Separator className="my-4" />
                  <div className="border-destructive/30 bg-destructive/5 rounded-lg border px-3 py-2.5">
                    <p className="text-destructive text-xs font-medium">
                      Cancellation reason
                    </p>
                    <p className="mt-0.5 text-sm">
                      {booking.cancellation_reason}
                    </p>
                  </div>
                </>
              ) : null}
            </SectionCard>

            <SectionCard
              icon={MapPin}
              title="Pickup"
              description="Taken from the booking, not the live profile, so this stays what they agreed to."
            >
              <dl className="space-y-3 text-sm">
                <Row label="Date and slot">
                  {formatDate(booking.pickup_slot_date)}
                  <span className="text-muted-foreground block text-xs">
                    {booking.slotLabel ?? "No slot recorded"}
                  </span>
                </Row>

                <Row label="Payment mode">
                  <span className="inline-flex items-center gap-1.5">
                    <CreditCard
                      className="text-muted-foreground size-3.5"
                      aria-hidden
                    />
                    <span className="uppercase">{booking.payment_mode}</span>
                  </span>
                </Row>

                <Row label="Address">
                  <span className="flex items-start gap-1.5">
                    <MapPin
                      className="text-muted-foreground mt-0.5 size-4 shrink-0"
                      aria-hidden
                    />
                    <span>{booking.address_snapshot}</span>
                  </span>
                </Row>
              </dl>
            </SectionCard>

            <SectionCard
              icon={Route}
              title="Pickup agent"
              description="Who is collecting this booking. Assignment is not collection: the booking still has to be moved to Picked Up once it is."
            >
              <div className="space-y-3">
                {assignablePickup ? (
                  <PickupAssignmentControls
                    orderId={booking.id}
                    agents={agents}
                    assignment={
                      booking.pickupAgent
                        ? { agent_id: booking.pickupAgent.id || null }
                        : null
                    }
                  />
                ) : (
                  <p className="text-muted-foreground text-sm">
                    {booking.pickupAgent ? (
                      <>
                        Collected by {booking.pickupAgent.fullName}. A pickup
                        agent can no longer be assigned at this stage.
                      </>
                    ) : (
                      "No pickup agent was assigned, and one can no longer be assigned at this stage."
                    )}
                  </p>
                )}

                {booking.pickupAgent && !assignablePickup ? (
                  <p className="text-muted-foreground text-xs">
                    Assigned {formatDateTime(booking.pickupAgent.assignedAt)}
                    {booking.pickupAgent.automated
                      ? " by the automatic rule"
                      : ""}
                    .
                  </p>
                ) : null}
              </div>
            </SectionCard>

            <SectionCard
              icon={Truck}
              title="Delivery agent"
              description="Who is carrying it out. Available once the booking is ready."
            >
              <DeliveryAssignmentControl
                orderId={booking.id}
                agents={agents}
                assignment={booking.deliveryAgent}
                canAssign={booking.status === "ready_for_delivery"}
              />
            </SectionCard>

            {/* The two identifiers nobody reads first, kept out of the way. */}
            <SectionCard
              icon={Hash}
              title="Reference"
              description="Internal identifiers, for support and for logs."
            >
              <dl className="space-y-3 text-sm">
                <Row label="Booking ID">
                  <span className="text-muted-foreground font-mono text-xs break-all">
                    {booking.id}
                  </span>
                </Row>
                <Row label="Placed">{formatDateTime(booking.created_at)}</Row>
                <Row label="Last updated">
                  {formatDateTime(booking.updated_at)}
                </Row>
                <Row label="Shop">
                  <span className="inline-flex items-center gap-1.5">
                    <Store
                      className="text-muted-foreground size-3.5"
                      aria-hidden
                    />
                    <span className="capitalize">
                      {booking.source.replace(/_/g, " ")}
                    </span>
                  </span>
                </Row>
              </dl>
            </SectionCard>
          </div>
        </div>
      </div>
    </PanelPage>
  );
}

/**
 * A label and its value, stacked.
 *
 * The dt is the small muted line and the dd is the readable one, which is the
 * opposite of the usual table layout on purpose: on this screen the value is what
 * is being read and the label only has to be findable.
 */
function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

/** Up to two letters for the customer avatar, from a name that may be one word. */
function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}
