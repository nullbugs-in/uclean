import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { OrderTimeline } from "@/components/order-timeline";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getOrderDetail } from "@/db/queries/orders";
import { createClient } from "@/db/server";
import { INTERNAL_STATUS_LABEL } from "@/lib/order-status";
import { formatINR } from "@/lib/utils";
import { requireRoleOrRedirect } from "@/server/auth";
import { StaffPage } from "../../../_components/staff-page";
import { StaffOrderStatusActions } from "./status-actions";

export const metadata: Metadata = { title: "Order" };

/**
 * Staff view of one order (section 10).
 *
 * RLS decides visibility: an agent reaches only orders they are assigned
 * against, store staff reach all of them. Not found means either it does not
 * exist or it is not theirs, and the page does not distinguish.
 */
export default async function StaffOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireRoleOrRedirect(["staff", "admin"], `/staff/orders/${id}`);

  const supabase = await createClient();
  const order = await getOrderDetail(supabase, id).catch(() => null);

  if (!order) notFound();

  const itemsTotal = order.order_items.reduce(
    (sum, item) => sum + item.qty * item.unit_price,
    0,
  );

  return (
    <StaffPage
      title={`Order ${order.order_no}`}
      description="Items, status and the transitions you are allowed to make."
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Items received</CardTitle>
            <Badge variant="secondary">
              {INTERNAL_STATUS_LABEL[order.status]}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {order.order_items.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">
                No items recorded yet. Admin records items in Milestone 4.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--border)] text-sm">
                {order.order_items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between py-2"
                  >
                    <span>
                      {item.item_name}
                      <span className="text-[var(--muted-foreground)]">
                        {" "}
                        x {item.qty}
                      </span>
                    </span>
                    <span>{formatINR(item.qty * item.unit_price)}</span>
                  </li>
                ))}
                <li className="flex items-center justify-between pt-2 font-medium">
                  <span>Estimated total</span>
                  <span>{formatINR(itemsTotal)}</span>
                </li>
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Update status</CardTitle>
            </CardHeader>
            <CardContent>
              <StaffOrderStatusActions
                orderId={order.id}
                status={order.status}
              />
              <p className="mt-3 text-xs text-[var(--muted-foreground)]">
                Only the transitions the database permits are shown. The
                orders_enforce_transition trigger rejects anything else.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">History</CardTitle>
            </CardHeader>
            <CardContent>
              <OrderTimeline
                status={order.status}
                history={order.order_status_history}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </StaffPage>
  );
}
