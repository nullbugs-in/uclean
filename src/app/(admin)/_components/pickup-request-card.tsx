import { Fragment } from "react";
import {
  MapPin,
  Phone,
  Shirt,
  Sparkles,
  StickyNote,
  UserRound,
} from "lucide-react";

import { INTERNAL_STATUS_LABEL } from "@/lib/order-status";
import { cn } from "@/lib/utils";
import type { PickupAgent, PickupRequest } from "@/db/queries/admin-pickups";
import { hasUsableCoordinates } from "@/db/queries/admin-pickups";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { PickupAssignmentControls } from "./pickup-assignment-controls";

/**
 * One pickup request on the dispatch board.
 *
 * The slot time leads, because this screen is read by someone deciding who is
 * free, and time is what they are scanning for. Customer, address and services
 * follow underneath in the order a driver needs them: who, where, what.
 *
 * The status badge is the only thing allowed to shout. An unassigned pickup is
 * the one row in this list that is an unfinished job, so it is the only one that
 * gets colour.
 */
export function PickupRequestCard({
  request,
  agents,
}: {
  request: PickupRequest;
  agents: PickupAgent[];
}) {
  const { order } = request;
  const assigned = request.assignment !== null;

  return (
    <Card className={cn("gap-4 py-4", !assigned && "border-warning/50")}>
      <CardHeader className="px-4">
        {/*
         * The signature element: the slot, set in tabular figures so a column of
         * these lines up on the minutes the way a schedule does.
         */}
        {/* Same guard as the delivery card: long slot labels truncate instead
            of pushing the order number out of the header row. */}
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="truncate text-base font-semibold tabular-nums">
            {request.slotLabel ?? "No slot"}
          </span>
          <span className="text-muted-foreground shrink-0 font-mono text-xs">
            {order.order_no}
          </span>
        </div>

        <CardTitle className="text-muted-foreground mt-1 text-xs font-medium">
          {INTERNAL_STATUS_LABEL[order.status]}
        </CardTitle>

        <CardAction>
          <Badge variant={assigned ? "success" : "warning"}>
            {assigned ? "Assigned" : "Needs an agent"}
          </Badge>
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-3 px-4">
        {/* Who and how to reach them, side by side. */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <p className="flex items-center gap-2 text-sm">
            <UserRound
              className="text-muted-foreground size-4 shrink-0"
              aria-hidden
            />
            <span className="font-medium">{order.customer_name}</span>
          </p>

          {order.customer_mobile ? (
            <a
              href={`tel:${order.customer_mobile}`}
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 text-sm underline-offset-4 hover:underline"
            >
              <Phone className="size-4 shrink-0" aria-hidden />
              {order.customer_mobile}
            </a>
          ) : (
            <span className="text-muted-foreground inline-flex items-center gap-2 text-sm">
              <Phone className="size-4 shrink-0" aria-hidden />
              No mobile given
            </span>
          )}
        </div>

        {/*
         * The address leads its row and the map link sits at the end, so the
         * eye runs the text rather than stopping at a control.
         */}
        <div className="flex flex-wrap items-start gap-2 text-sm">
          <MapPin
            className="text-muted-foreground mt-0.5 size-4 shrink-0"
            aria-hidden
          />
          <span className="min-w-0 flex-1">{order.address_snapshot}</span>

          {/*
           * Only linked when the coordinates are real. The booking wizard stores
           * the store's own point as a placeholder while the map work is out of
           * scope, so a link built from it would drop a driver at the shop rather
           * than at the customer's flat. Saying nothing beats sending someone
           * somewhere misleading.
           */}
          {hasUsableCoordinates(order.lat, order.lng) ? (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${order.lat},${order.lng}`}
              target="_blank"
              rel="noreferrer"
              className="text-primary text-xs font-medium underline-offset-4 hover:underline"
            >
              Open map
            </a>
          ) : (
            <span className="text-muted-foreground text-xs">No pin yet</span>
          )}
        </div>

        {request.items.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Shirt
              className="text-muted-foreground size-4 shrink-0"
              aria-hidden
            />
            <ul className="flex flex-wrap gap-x-3 gap-y-1">
              {request.items.map((item) => (
                <Fragment key={item.id}>
                  <li>
                    {item.item_name}
                    {item.qty > 1 ? (
                      <span className="text-muted-foreground tabular-nums">
                        {" "}
                        &times;{item.qty}
                      </span>
                    ) : null}
                  </li>
                </Fragment>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <Shirt className="size-4 shrink-0" aria-hidden />
            No services recorded against this order.
          </p>
        )}

        {order.notes ? (
          <p className="bg-muted/50 flex items-start gap-2 rounded-md px-2.5 py-2 text-sm">
            <StickyNote
              className="text-muted-foreground mt-0.5 size-4 shrink-0"
              aria-hidden
            />
            <span>
              <span className="text-muted-foreground text-xs">Note </span>
              {order.notes}
            </span>
          </p>
        ) : null}

        {/* The assigned agent, or the prompt to choose one. */}
        <div className="border-border flex flex-wrap items-center gap-2 border-t pt-3">
          {assigned && request.agentName ? (
            <span className="flex items-center gap-2">
              <Avatar size="sm">
                <AvatarFallback className="bg-primary/15 text-foreground text-xs font-semibold">
                  {initials(request.agentName)}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium">{request.agentName}</span>
              {request.agentMobile ? (
                <a
                  href={`tel:${request.agentMobile}`}
                  className="text-muted-foreground text-xs underline-offset-4 hover:underline"
                >
                  Call
                </a>
              ) : null}
            </span>
          ) : (
            <span className="text-muted-foreground flex items-center gap-2 text-sm">
              <Sparkles className="size-4 shrink-0" aria-hidden />
              Nobody is on this one yet.
            </span>
          )}
        </div>

        <PickupAssignmentControls
          orderId={order.id}
          agents={agents}
          assignment={request.assignment}
        />
      </CardContent>
    </Card>
  );
}

/**
 * Two-letter monogram.
 *
 * Local to the panel, matching the copy in `user-menu.tsx`. The account glass
 * system exports an equivalent, but importing from there would drag
 * `account-theme.css` tokens into the admin panel, which is deliberately scoped
 * the other way.
 */
function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];

  if (!first) return "?";

  if (parts.length === 1) return first.slice(0, 2).toUpperCase();

  const last = parts[parts.length - 1];
  return `${first[0]}${last?.[0] ?? ""}`.toUpperCase();
}
