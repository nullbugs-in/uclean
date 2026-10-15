import type { Metadata } from "next";
import Link from "next/link";

import { PagePlaceholder } from "@/components/placeholder";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listOrdersForCustomer } from "@/db/queries/orders";
import { createClient } from "@/db/server";
import { CUSTOMER_STATUS_LABEL } from "@/lib/order-status";
import { formatDate } from "@/lib/utils";
import { requireRoleOrRedirect } from "@/server/auth";

export const metadata: Metadata = { title: "My orders" };

export default async function CustomerOrdersPage() {
  const session = await requireRoleOrRedirect(
    ["customer", "staff", "admin"],
    "/account/orders",
  );
  const supabase = await createClient();

  const orders = await listOrdersForCustomer(
    supabase,
    session.profile.id,
  ).catch(() => []);

  return (
    <PagePlaceholder
      title="My orders"
      description="Every order you have placed, newest first."
    >
      {orders.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          No orders yet.{" "}
          <Link
            href="/account/book"
            className="font-medium text-[var(--primary)] underline-offset-4 hover:underline"
          >
            Book a pickup
          </Link>
          .
        </p>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <Card key={order.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-4">
                  <CardTitle className="text-base">{order.order_no}</CardTitle>
                  <Badge variant="secondary">
                    {CUSTOMER_STATUS_LABEL[order.status]}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-1 text-sm text-[var(--muted-foreground)]">
                <p>Pickup {formatDate(order.pickup_slot_date)}</p>
                <p>Distance from store: {order.distance_km} km</p>
                <p>{order.address_snapshot}</p>
                <Link
                  href={`/account/orders/${order.id}`}
                  className="mt-2 inline-block text-sm font-medium text-[var(--primary)] underline-offset-4 hover:underline"
                >
                  Track order
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PagePlaceholder>
  );
}
