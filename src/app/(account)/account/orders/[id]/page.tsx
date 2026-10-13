import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PagePlaceholder } from "@/components/placeholder";
import { OrderTimeline } from "@/components/order-timeline";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getOrderDetail } from "@/db/queries/orders";
import { createClient } from "@/db/server";
import { CUSTOMER_STATUS_LABEL } from "@/lib/order-status";
import { formatDateTime } from "@/lib/utils";
import { requireRoleOrRedirect } from "@/server/auth";

export const metadata: Metadata = { title: "Track order" };

/**
 * Order tracking page (section 6.3).
 *
 * The timeline renders from the status history, so Supabase Realtime can push
 * new rows onto this screen while the order is in progress. RLS means a
 * customer can only reach their own order; anyone else's id 404s.
 */
export default async function OrderTrackingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireRoleOrRedirect(
    ["customer", "staff", "admin"],
    `/account/orders/${id}`,
  );

  const supabase = await createClient();
  const order = await getOrderDetail(supabase, id).catch(() => null);

  if (!order) notFound();

  return (
    <PagePlaceholder
      title={`Order ${order.order_no}`}
      description="Live tracking for your pickup and delivery."
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Tracking</CardTitle>
            <Badge variant="secondary">
              {CUSTOMER_STATUS_LABEL[order.status]}
            </Badge>
          </CardHeader>
          <CardContent>
            <OrderTimeline
              status={order.status}
              history={order.order_status_history}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pickup details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="font-medium">{order.address_snapshot}</p>
            <p className="text-[var(--muted-foreground)]">
              {order.distance_km} km from the store
            </p>
            <p className="text-[var(--muted-foreground)]">
              Booked {formatDateTime(order.created_at)}
            </p>
            {order.notes ? (
              <p className="text-[var(--muted-foreground)]">
                Notes: {order.notes}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </PagePlaceholder>
  );
}
