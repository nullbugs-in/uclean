"use server";

import {
  getOrderDetail,
  listActiveOrdersForCustomer,
} from "@/db/queries/orders";
import { createClient } from "@/db/server";
import type { OrderStatusHistory } from "@/db/types";
import type { OrderStatus } from "@/lib/order-status";
import { getAuthUser } from "@/server/auth";

export type MyBookings = {
  activeCount: number;
  latest: {
    orderId: string;
    orderNo: string;
    status: OrderStatus;
    pickupDate: string;
    address: string;
    history: OrderStatusHistory[];
  } | null;
};

/**
 * What the navbar "My bookings" panel shows: the customer's most recent active
 * order with its tracking history.
 *
 * Loaded on demand when the panel is first expanded, so browsing any public
 * page never runs this query.
 *
 * Authentication is required, and the order is fetched through
 * `listActiveOrdersForCustomer`, which scopes by customer id, so one customer
 * can never see another's order.
 */
export async function getMyBookingsAction(): Promise<MyBookings> {
  const empty: MyBookings = { activeCount: 0, latest: null };

  const user = await getAuthUser();
  if (!user) return empty;

  const supabase = await createClient();

  const orders = await listActiveOrdersForCustomer(supabase, user.id).catch(
    () => [],
  );

  const latest = orders[0];
  const detail = latest
    ? await getOrderDetail(supabase, latest.id).catch(() => null)
    : null;

  return {
    activeCount: orders.length,
    latest: latest
      ? {
          orderId: latest.id,
          orderNo: latest.order_no,
          status: latest.status as OrderStatus,
          pickupDate: latest.pickup_slot_date,
          address: latest.address_snapshot,
          history: detail?.order_status_history ?? [],
        }
      : null,
  };
}
