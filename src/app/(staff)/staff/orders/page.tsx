import type { Metadata } from "next";
import { CycleMeter } from "@/components/panel/cycle-meter";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listOrdersForStaff } from "@/db/queries/orders";
import { createClient } from "@/db/server";

import { dayLabel } from "../../_components/assignment-card";
import { PanelPage } from "@/components/panel/panel-page";

export const metadata: Metadata = { title: "Orders" };

/**
 * Every order the agent can reach, in pickup order (section 10).
 *
 * The `from` date is deliberately the epoch: unlike the pickup and delivery
 * screens, which are forward-looking by nature, this is the whole book an agent
 * is allowed to see, including what has already gone out. RLS decides which rows
 * that is - assigned to them, or everything when can_view_all_orders is set.
 *
 * Status is drawn as the same cycle meter as everywhere else, so a row here
 * reads exactly as it does on the round.
 */
export default async function StaffOrdersPage() {
  const supabase = await createClient();
  const orders = await listOrdersForStaff(supabase, {
    from: "2000-01-01",
    limit: 200,
  });

  return (
    <PanelPage
      title="Orders"
      description="Everything you can see, in pickup order."
    >
      {orders.length === 0 ? (
        <div className="border-border rounded-lg border border-dashed px-6 py-12 text-center">
          <p className="font-medium">No orders yet</p>
          <p className="text-muted-foreground mx-auto mt-1 max-w-md text-sm">
            Orders appear here as soon as one is booked and reaches your list.
          </p>
        </div>
      ) : (
        <div className="border-border rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Pickup</TableHead>
                <TableHead className="text-right">Distance</TableHead>
                <TableHead className="min-w-[200px]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium whitespace-nowrap">
                    {order.order_no}
                  </TableCell>
                  <TableCell>
                    <span className="block">{order.customer_name}</span>
                    <span className="text-muted-foreground block text-xs">
                      {order.customer_mobile}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {dayLabel(order.pickup_slot_date)}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {order.distance_km.toFixed(1)} km
                  </TableCell>
                  <TableCell>
                    <CycleMeter status={order.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </PanelPage>
  );
}
