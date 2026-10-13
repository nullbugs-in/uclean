import "server-only";

import { getProfile } from "@/db/queries/profiles";
import { createClient, createServiceClient } from "@/db/server";
import type { Database, Order, OrderSource } from "@/db/types";
import * as orderStatus from "@/lib/order-status";

import {
  forbidden,
  invalidTransition,
  unauthenticated,
  zoneNoticeNotAccepted,
} from "./errors";
import { googleServerKey } from "./env";
import { assertWithinDeliveryZone } from "./maps";

export type CreatePickupInput = {
  customerId: string;
  address: string;
  lat: number;
  lng: number;
  whatsappNumber?: string | null;
  notes?: string | null;
  slotDate: string;
  slotId: string;
  zoneNoticeAcceptedAt: string;
  source?: OrderSource;
  createdBy?: string | null;
};

export type CreatePickupResult = {
  orderId: string;
  orderNo: string;
  distanceKm: number;
};

/**
 * Creates a pickup booking.
 *
 * The order of operations is the whole point of this function:
 *
 *   1. Verify the caller may book on this profile's behalf.
 *   2. Re-read name and mobile from `profiles` rather than accepting them from
 *      the form, so a booking records who the customer is *now* (section 6.1).
 *   3. Recompute the driving distance server side. The browser's number is
 *      never used, which is what makes the 6 km rule unbypassable.
 *   4. Call book_pickup, which re-checks capacity and the zone under a row
 *      lock inside one transaction.
 */
export async function createPickupOrder(
  input: CreatePickupInput,
): Promise<CreatePickupResult> {
  if (!input.zoneNoticeAcceptedAt) {
    throw zoneNoticeNotAccepted();
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) throw unauthenticated();

  const isAdminBookingForOther = input.customerId !== user.id;
  if (isAdminBookingForOther) {
    // Walk-in and phone orders are entered by staff on an admin/staff account.
    const profile = await getProfile(supabase, user.id);
    if (!profile || (profile.role !== "admin" && profile.role !== "staff")) {
      throw forbidden();
    }
  }

  const customer = await getProfile(supabase, input.customerId);
  if (!customer) {
    throw new Error(`No profile found for customer ${input.customerId}`);
  }

  const { distanceKm } = await assertWithinDeliveryZone(
    { lat: input.lat, lng: input.lng },
    googleServerKey(),
  );

  // The booking RPC is SECURITY DEFINER and validates capacity, the blocked
  // dates, and the zone again under a lock. The service role is used because
  // there is deliberately no INSERT policy on orders.
  const service = createServiceClient();

  const { data: orderId, error } = await service.rpc("book_pickup", {
    p_customer_id: input.customerId,
    p_customer_name: customer.full_name,
    p_customer_mobile: customer.mobile,
    p_address: input.address,
    p_lat: input.lat,
    p_lng: input.lng,
    p_distance_km: distanceKm,
    p_pickup_slot_date: input.slotDate,
    p_pickup_slot_id: input.slotId,
    p_accepted_zone_notice_at: input.zoneNoticeAcceptedAt,
    p_whatsapp_number: input.whatsappNumber || null,
    p_notes: input.notes || null,
    p_source: input.source ?? "online",
    p_created_by: input.createdBy ?? null,
  });

  if (error || !orderId) {
    throw new Error(`book_pickup failed: ${error?.message ?? "unknown error"}`);
  }

  const { data: order, error: orderError } = await service
    .from("orders")
    .select("order_no")
    .eq("id", orderId)
    .single();

  if (orderError) throw new Error(orderError.message);

  return { orderId, orderNo: order.order_no, distanceKm };
}

/**
 * Moves an order to a new status after checking the transition is legal.
 *
 * The database trigger `orders_enforce_transition` is the real gate; this
 * check exists so the caller gets a typed error instead of a raw Postgres
 * exception, and so the UI never offers a button that would fail.
 */
export async function changeOrderStatus(
  orderId: string,
  toStatus: Order["status"],
  note?: string,
): Promise<void> {
  const supabase = await createClient();

  const { data: order, error } = await supabase
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!order) throw new Error("Order not found");

  const { canTransition } = orderStatus;
  if (!canTransition(order.status, toStatus)) {
    throw invalidTransition(order.status, toStatus);
  }

  const update: Database["public"]["Tables"]["orders"]["Update"] = {
    status: toStatus,
  };
  if (note) update.cancellation_reason = note;

  const { error: updateError } = await supabase
    .from("orders")
    .update(update)
    .eq("id", orderId);

  if (updateError) throw new Error(updateError.message);
}

/**
 * Picks an agent for an order.
 *
 * Tries automatic assignment first; if no agent is free the order is left at
 * pickup_requested for an admin to assign manually from the dropdown of free
 * agents (section 8.3).
 */
export async function assignAgent(
  orderId: string,
  agentId?: string,
): Promise<{ agentId: string | null; automatic: boolean }> {
  const service = createServiceClient();

  const { data: order, error } = await service
    .from("orders")
    .select("id, pickup_slot_date, pickup_slot_id, status")
    .eq("id", orderId)
    .single();

  if (error) throw new Error(error.message);

  if (agentId) {
    const { error: insertError } = await service
      .from("pickup_assignments")
      .upsert(
        {
          order_id: orderId,
          agent_id: agentId,
          type: "pickup",
          status: "assigned",
          assigned_by_type: "manual",
        },
        { onConflict: "order_id,type" },
      );

    if (insertError) throw new Error(insertError.message);

    if (order.status === "pickup_requested") {
      const { error: statusError } = await service
        .from("orders")
        .update({ status: "agent_assigned" })
        .eq("id", orderId);

      if (statusError) throw new Error(statusError.message);
    }

    return { agentId, automatic: false };
  }

  const { data: assigned, error: rpcError } = await service.rpc(
    "auto_assign_agent",
    {
      p_order_id: orderId,
      p_slot_date: order.pickup_slot_date,
      p_slot_id: order.pickup_slot_id,
      p_zone: null,
    },
  );

  if (rpcError) throw new Error(rpcError.message);

  return { agentId: assigned ?? null, automatic: true };
}
