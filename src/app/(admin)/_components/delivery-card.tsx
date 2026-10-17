import { Fragment } from "react";
import {
  CheckCircle2,
  IndianRupee,
  MapPin,
  Phone,
  Shirt,
  StickyNote,
  UserRound,
  Wallet,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { DeliveryRequest } from "@/db/queries/admin-deliveries";
import { hasUsableCoordinates } from "@/db/queries/admin-pickups";
import type { PickupAgent } from "@/db/queries/admin-pickups";
import { INTERNAL_STATUS_LABEL } from "@/lib/order-status";
import { cn, formatINR } from "@/lib/utils";

import { DeliveryAssignmentControl } from "./delivery-assignment-control";

/**
 * One delivery on the dispatch board (section 8.8).
 *
 * Where the pickup card leads with a slot time, this one leads with the money:
 * the question a delivery queue answers is "who is taking this out, and what are
 * they coming back with". So the customer and the cash sit at the top and the
 * agent control closes the card, which is the order the work happens in.
 *
 * The status badge is the only thing allowed to shout, as on the pickup board:
 * an unassigned delivery is the one unfinished job here, so it is the one that
 * gets colour.
 */
export function DeliveryCard({
  request,
  agents,
}: {
  request: DeliveryRequest;
  agents: PickupAgent[];
}) {
  const { order, invoice, collected } = request;
  const assigned = request.agent !== null;
  // `ready_for_delivery -> out_for_delivery` is the transition an agent is named
  // on; once it is out, the person is settled and the control locks.
  const canAssign = order.status === "ready_for_delivery";

  return (
    <Card className={cn("gap-4 py-4", !assigned && "border-warning/50")}>
      <CardHeader className="px-4">
        <div className="flex items-baseline gap-3">
          <span className="text-base font-semibold">{order.customer_name}</span>
          <span className="text-muted-foreground font-mono text-xs">
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
        {/* The headline: what the driver collects, or why there is nothing to. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          {invoice === null ? (
            <>
              <Wallet
                className="text-muted-foreground size-4 shrink-0"
                aria-hidden
              />
              <span className="text-muted-foreground">
                Not billed yet. Raise the invoice before this goes out.
              </span>
            </>
          ) : collected ? (
            <>
              <CheckCircle2
                className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                aria-hidden
              />
              <span className="text-muted-foreground">
                {formatINR(invoice.total)} collected
              </span>
              <Badge variant="success">Paid</Badge>
            </>
          ) : (
            <>
              <IndianRupee
                className="size-4 shrink-0 text-amber-600 dark:text-amber-400"
                aria-hidden
              />
              <span className="font-medium">
                {order.payment_mode === "cod"
                  ? `Collect ${formatINR(invoice.total)} in cash`
                  : `${formatINR(invoice.total)} still to pay`}
              </span>
              <Badge variant="warning">COD</Badge>
            </>
          )}
        </div>

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
          ) : null}
        </div>

        {/* The drop, with the map link at the end so the eye runs the text. */}
        <div className="flex flex-wrap items-start gap-2 text-sm">
          <MapPin
            className="text-muted-foreground mt-0.5 size-4 shrink-0"
            aria-hidden
          />
          <span className="min-w-0 flex-1">{order.address_snapshot}</span>

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
        ) : null}

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
      </CardContent>

      <CardContent className="px-4">
        <DeliveryAssignmentControl
          orderId={order.id}
          agents={agents}
          assignment={request.agent}
          canAssign={canAssign}
        />
      </CardContent>
    </Card>
  );
}
