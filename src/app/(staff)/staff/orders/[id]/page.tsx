import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { OrderTimeline } from "@/components/order-timeline";
import { CycleMeter } from "@/components/panel/cycle-meter";
import { InvoiceStatusBadge } from "@/components/panel/invoice-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listInvoicesForOrders } from "@/db/queries/billing";
import { getOrderDetail } from "@/db/queries/orders";
import { createClient } from "@/db/server";
import { INTERNAL_STATUS_LABEL } from "@/lib/order-status";
import { formatINR } from "@/lib/utils";
import { requireRoleOrRedirect } from "@/server/auth";
import { PanelPage } from "@/components/panel/panel-page";
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

  /*
   * The invoice, when one has been raised for the booking: RLS gives an agent
   * the bill on an order they are assigned against, the same way the customer's
   * card and the bills list see it.
   */
  const [invoice] = await listInvoicesForOrders(supabase, [order.id]).catch(
    () => [],
  );

  const itemsTotal = order.order_items.reduce(
    (sum, item) => sum + item.qty * item.unit_price,
    0,
  );

  return (
    <PanelPage
      title={`Order ${order.order_no}`}
      description="Items, status and the transitions you are allowed to make."
      action={<CycleMeter status={order.status} className="w-full max-w-60" />}
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
              <p className="text-muted-foreground text-sm">
                No items recorded yet. Items are added when the order is
                assessed.
              </p>
            ) : (
              <ul className="divide-border divide-y text-sm">
                {order.order_items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between py-2"
                  >
                    <span>
                      {item.item_name}
                      <span className="text-muted-foreground">
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
          {invoice ? (
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-base">Invoice</CardTitle>
                <InvoiceStatusBadge status={invoice.status} />
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>
                  <span className="font-mono">{invoice.invoice_no}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {formatINR(invoice.total)} collected on delivery
                  </span>
                </p>
                {invoice.status !== "draft" && invoice.pay_token ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/pay/${invoice.pay_token}`}>View invoice</Link>
                  </Button>
                ) : null}
                {invoice.status === "draft" ? (
                  <p className="text-muted-foreground text-xs">
                    Not sent to the customer yet — no cash is due from this bill
                    until it is sent.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Update status</CardTitle>
            </CardHeader>
            <CardContent>
              <StaffOrderStatusActions
                orderId={order.id}
                status={order.status}
              />
              <p className="text-muted-foreground mt-3 text-xs">
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
    </PanelPage>
  );
}
