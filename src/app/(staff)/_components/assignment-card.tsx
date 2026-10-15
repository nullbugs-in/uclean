import Link from "next/link";
import { ArrowRight, Navigation } from "lucide-react";

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
import { INTERNAL_STATUS_LABEL } from "@/lib/order-status";
import { formatDate } from "@/lib/utils";
import { toDateKey } from "@/server/slots";

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

/**
 * One stop on an agent's list: which order, who, where, and how far along it is.
 *
 * Shared by the pickup and delivery lists and by the overview round so the same
 * stop never reads two different ways depending on which screen it lands on.
 *
 * Navigation is offered for both legs. The deliveries screen describes itself as
 * giving navigation links, but the list it renders previously only offered them
 * for pickups, so a driver had no shortcut to the address they were driving to.
 */
export function AssignmentCard({
  row,
  type,
}: {
  row: AssignedOrder;
  type: AssignmentType;
}) {
  const { order, assignmentStatus } = row;
  const slotDate =
    type === "pickup" ? order.pickup_slot_date : order.delivery_slot_date;
  const day = dayLabel(slotDate);

  const mapsHref = `https://www.google.com/maps/dir/?api=1&destination=${order.lat},${order.lng}`;

  return (
    <Card className="gap-4 py-4">
      <CardHeader>
        <div className="space-y-1">
          <CardTitle className="text-base">{order.order_no}</CardTitle>
          <p className="text-muted-foreground text-xs">
            {type === "pickup" ? "Pickup" : "Delivery"} &middot;{" "}
            {day ? day : "no slot yet"} &middot;{" "}
            {order.distance_km.toFixed(1)} km
          </p>
        </div>
        <CardAction>
          <Badge variant={badgeVariant(order.status)}>
            {INTERNAL_STATUS_LABEL[order.status]}
          </Badge>
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-0.5 text-sm">
          <p className="font-medium">{order.customer_name}</p>
          <p className="text-muted-foreground">{order.customer_mobile}</p>
          <p className="text-muted-foreground">{order.address_snapshot}</p>
        </div>

        <CycleMeter status={order.status} />

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <a
              href={mapsHref}
              target="_blank"
              rel="noreferrer noopener"
            >
              <Navigation />
              Navigate
            </a>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link href={`/staff/orders/${order.id}`}>
              Open order
              <ArrowRight />
            </Link>
          </Button>
          <span className="text-muted-foreground ml-auto text-xs capitalize">
            {assignmentStatus.replace("_", " ")}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
