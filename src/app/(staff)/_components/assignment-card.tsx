import Link from "next/link";
import {
  ArrowRight,
  MapPin,
  Navigation,
  Phone,
  ReceiptText,
  SquareArrowOutUpRight,
} from "lucide-react";

import { CycleMeter } from "@/components/panel/cycle-meter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AssignedOrder } from "@/db/queries/staff";
import type { AssignmentType, OrderStatus } from "@/db/types";
import { toDateKey } from "@/lib/dates";
import { INTERNAL_STATUS_LABEL } from "@/lib/order-status";
import { cn, formatDate } from "@/lib/utils";

import { AssignmentStatusActions } from "./assignment-status-actions";

function badgeVariant(status: OrderStatus) {
  if (status === "delivered") return "success" as const;
  if (status === "cancelled") return "destructive" as const;
  return "secondary" as const;
}

/**
 * Today / Tomorrow / a real date, for a slot's local day key.
 *
 * The key is parsed with an explicit midnight because a bare YYYY-MM-DD is read
 * as UTC, which would move an evening slot back a day for anyone west of the
 * server's meridian.
 */
export function dayLabel(key: string | null): string | null {
  if (!key) return null;

  const today = toDateKey(new Date());
  if (key === today) return "Today";

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (key === toDateKey(tomorrow)) return "Tomorrow";

  return formatDate(`${key}T00:00:00`);
}

/** Up to two leading initials, for the monogram on a stop's card. */
function monogramOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

/**
 * One stop on an agent's list: who they are visiting, where, and how far along
 * the leg is.
 *
 * The card is a stop ticket, so its headline is the customer, not the order
 * number — a driver recognises a name, and the tile can be found mid-scroll in
 * a long list. The order number lives in the meta line with the leg, the slot
 * day and the distance. One emphasis rule on the meta line: "Today" renders in
 * the brand lime, the colour that means "this is now"; every other day renders
 * quiet.
 *
 * Shared by the pickup and delivery lists and by the overview round so the same
 * stop never reads two different ways depending on which screen it lands on.
 *
 * Navigation is the prominent action on every leg. The deliveries screen
 * describes itself as giving navigation links, but the list it renders
 * previously only offered them for pickups, so a driver had no shortcut to the
 * address they were driving to.
 *
 * Status transitions are the one deliberate difference: the pickups screen opts
 * in (`showStatusActions`), where the row reads Navigate, then the allowed
 * transitions (Picked Up / Cancelled); a staff member can close out a pickup
 * without opening the order. The overview round and the delivery list keep
 * Navigate and Open order and stay read-only.
 */
export function AssignmentCard({
  row,
  type,
  showStatusActions = false,
}: {
  row: AssignedOrder;
  type: AssignmentType;
  /**
   * Opt-in status buttons on the card. Only the pickups screen sets it: the
   * overview round is intentionally a read of the day, and the delivery list
   * has its own transitions it does not make on the doorstep.
   */
  showStatusActions?: boolean;
}) {
  const { order, assignmentStatus } = row;
  const slotDate =
    type === "pickup" ? order.pickup_slot_date : order.delivery_slot_date;
  const day = dayLabel(slotDate);
  const isToday = day === "Today";

  /*
   * Google's universal directions URL with navigation asked for explicitly:
   * on a phone it hands off to the installed Google Maps app and lands in
   * turn-by-turn guidance to the customer's own pin (every booking records
   * the point the customer chose, orders.lat/lng); without the app it falls
   * back to the Maps site, which is what a desktop staff screen gets.
   */
  const mapsHref = `https://www.google.com/maps/dir/?api=1&destination=${order.lat},${order.lng}&travelmode=driving&dir_action=navigate`;
  const telHref = `tel:${order.customer_mobile}`;

  return (
    <Card className="gap-4 py-4 shadow-xs transition-shadow hover:shadow-md">
      <CardHeader>
        <div className="flex min-w-0 items-center gap-3">
          {/*
           * The monogram stands in for a customer while the panel holds no
           * images, and gives a long list of cards something to scan by.
           */}
          <span
            aria-hidden="true"
            className="bg-accent text-accent-foreground flex size-11 shrink-0 items-center justify-center rounded-xl text-sm font-semibold select-none"
          >
            {monogramOf(order.customer_name) || "UC"}
          </span>
          <div className="min-w-0 space-y-1">
            <CardTitle className="truncate text-lg tracking-tight">
              {order.customer_name}
            </CardTitle>
            <p className="text-muted-foreground inline-flex flex-wrap items-center gap-x-2 text-xs">
              <span className="font-mono">{order.order_no}</span>
              <span>{type === "pickup" ? "Pickup" : "Delivery"}</span>
              {day ? (
                <span
                  className={cn(
                    isToday &&
                      /*
                       * Lime means "today": the one loud mark on the card,
                       * telling the agent this stop is on the round now.
                       */
                      "bg-primary text-primary-foreground rounded px-1.5 py-px font-semibold",
                  )}
                >
                  {day}
                </span>
              ) : (
                <span>no slot yet</span>
              )}
              <span className="tabular-nums">
                {order.distance_km.toFixed(1)} km
              </span>
            </p>
          </div>
        </div>
        <CardAction>
          <Badge variant={badgeVariant(order.status)}>
            {INTERNAL_STATUS_LABEL[order.status]}
          </Badge>
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-4">
        {/*
         * Where to go and how to reach the person. Both lines share one idiom:
         * an icon, then the fact. The number dials on tap; the address is the
         * address the order was placed against.
         */}
        <div className="space-y-1.5 text-sm">
          {order.customer_mobile ? (
            <a
              href={telHref}
              className="hover:text-foreground hover:bg-accent/50 -mx-1.5 inline-flex items-center gap-2 rounded-md px-1.5 py-0.5 transition-colors"
              aria-label={`Call ${order.customer_name} on ${order.customer_mobile}`}
            >
              <Phone
                className="text-muted-foreground size-3.5 shrink-0"
                aria-hidden="true"
              />
              {order.customer_mobile}
            </a>
          ) : null}
          <div className="-mx-1.5 flex items-start gap-2 px-1.5">
            <MapPin
              className="text-muted-foreground mt-0.5 size-3.5 shrink-0"
              aria-hidden="true"
            />
            <p className="text-muted-foreground leading-relaxed">
              {order.address_snapshot}
            </p>
          </div>
        </div>

        <CycleMeter status={order.status} />

        {row.invoice && row.invoice.status !== "draft" ? (
          /*
           * The bill on the stop, exactly as the customer was shown it. A draft
           * stays off the card — the customer cannot be billed from it yet, so
           * showing "unsent paperwork" would invite the agent to chase money
           * that is not due.
           */
          <div className="border-border/60 bg-muted/40 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
            <ReceiptText
              className="text-muted-foreground size-4 shrink-0"
              aria-hidden="true"
            />
            <span className="flex-1 truncate">
              <span className="font-mono">{row.invoice.invoice_no}</span>
              <span className="text-muted-foreground">
                {" "}
                · collected on delivery
              </span>
            </span>
            {row.invoice.pay_token ? (
              <Button asChild size="sm" variant="ghost">
                <Link href={`/pay/${row.invoice.pay_token}`}>View invoice</Link>
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {/* Navigate is the leg's primary action, so it carries the fill. */}
          <Button asChild size="sm">
            <a href={mapsHref} target="_blank" rel="noreferrer noopener">
              <Navigation />
              Navigate
              <SquareArrowOutUpRight
                className="opacity-60"
                aria-hidden="true"
              />
            </a>
          </Button>
          {showStatusActions ? (
            /*
             * Pickup stops close out from the card: Navigate, then the
             * status transitions, replacing "Open order". The transitions
             * wrap onto their own line under Navigate when the row runs out
             * of width.
             */
            <AssignmentStatusActions orderId={order.id} status={order.status} />
          ) : (
            <>
              <Button asChild size="sm" variant="ghost">
                <Link href={`/staff/orders/${order.id}`}>
                  Open order
                  <ArrowRight />
                </Link>
              </Button>
              <span className="text-muted-foreground ml-auto text-xs capitalize">
                {assignmentStatus.replace("_", " ")}
              </span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
