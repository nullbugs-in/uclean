import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listOrdersForStaff } from "@/db/queries/orders";
import { createClient } from "@/db/server";
import type { AssignmentType } from "@/db/types";
import { INTERNAL_STATUS_LABEL } from "@/lib/order-status";
import { formatDateTime } from "@/lib/utils";
import { toDateKey } from "@/server/slots";

/**
 * Pickup or delivery list for the staff panel (section 10).
 *
 * The list itself comes back already filtered: RLS restricts an ordinary agent
 * to orders they are assigned against, and lets store staff see everything.
 * There is no client-side role check here to get wrong.
 */
export async function AssignmentList({ type }: { type: AssignmentType }) {
  const supabase = await createClient();
  const today = new Date();

  const orders = await listOrdersForStaff(supabase, {
    from: toDateKey(today),
  }).catch(() => []);

  if (orders.length === 0) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">
        Nothing assigned yet. Assignments appear here once an admin assigns
        them.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {orders.map((order) => (
        <Card key={order.id}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-4">
              <CardTitle className="text-base">
                {order.order_no}
                <span className="ml-2 text-sm font-normal text-[var(--muted-foreground)]">
                  {type === "pickup" ? "Pickup" : "Delivery"}
                </span>
              </CardTitle>
              <Badge variant="secondary">
                {INTERNAL_STATUS_LABEL[order.status]}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-medium">{order.customer_name}</p>
            <p className="text-[var(--muted-foreground)]">
              {order.customer_mobile} &middot; {order.distance_km} km away
            </p>
            <p className="text-[var(--muted-foreground)]">
              {order.address_snapshot}
            </p>
            <p className="text-xs text-[var(--muted-foreground)]">
              Booked {formatDateTime(order.created_at)}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              {type === "pickup" ? (
                <Button asChild size="sm" variant="outline">
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${order.lat},${order.lng}`}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    Navigate
                  </a>
                </Button>
              ) : null}
              <Button asChild size="sm" variant="ghost">
                <Link href={`/staff/orders/${order.id}`}>Open order</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
