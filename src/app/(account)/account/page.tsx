import Link from "next/link";

import { PagePlaceholder } from "@/components/placeholder";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listActiveOrdersForCustomer } from "@/db/queries/orders";
import { createClient } from "@/db/server";
import { CUSTOMER_STATUS_LABEL } from "@/lib/order-status";
import { formatDate } from "@/lib/utils";
import { requireRoleOrRedirect } from "@/server/auth";

export const metadata = { title: "Dashboard" };

/**
 * Customer dashboard: active orders plus a link into the booking wizard.
 * Reads live orders through the query module so RLS scopes the result to the
 * signed-in customer.
 */
export default async function AccountDashboardPage() {
  const session = await requireRoleOrRedirect(
    ["customer", "staff", "admin"],
    "/account",
  );
  const supabase = await createClient();

  const orders = await listActiveOrdersForCustomer(
    supabase,
    session.profile.id,
  ).catch(() => []);

  return (
    <PagePlaceholder
      title={`Welcome, ${session.profile.full_name.split(" ")[0]}`}
      description="Your active laundry orders."
      milestone="Milestone 3"
    >
      {orders.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No active orders</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-[var(--muted-foreground)]">
              When you book a pickup it will appear here so you can track it.
            </p>
            <Button asChild>
              <Link href="/account/book">Book a pickup</Link>
            </Button>
          </CardContent>
        </Card>
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
                <p>Pickup: {formatDate(order.pickup_slot_date)}</p>
                <p>{order.address_snapshot}</p>
                <Button asChild size="sm" variant="outline" className="mt-2">
                  <Link href={`/account/orders/${order.id}`}>Track order</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PagePlaceholder>
  );
}
