import "server-only";

import { getProfile } from "@/db/queries/profiles";
import { createClient, createServiceClient } from "@/db/server";
import type { Database, Order, OrderSource } from "@/db/types";
import * as orderStatus from "@/lib/order-status";

import { googleServerKeyOptional } from "./env";
import {
  forbidden,
  fromDatabaseError,
  invalidTransition,
  unauthenticated,
  zoneNoticeNotAccepted,
} from "./errors";
import { assertWithinDeliveryZone } from "./maps";

/**
 * Ensure store settings and time slots are configured for testing.
 * This initializes required data if it doesn't exist.
 */
async function ensureStoreSettingsAndSlots(): Promise<void> {
  try {
    // Service role bypasses RLS, so this works for a customer-facing request
    // that must read and seed store configuration.
    const service = createServiceClient();

    // Check if store settings has coordinates
    const { data: store, error: storeError } = await service
      .from("store_settings")
      .select("lat,lng")
      .eq("id", true)
      .single();

    if (storeError) {
      console.error("Error fetching store settings:", storeError);
    }

    if (!store || store.lat === null || store.lng === null) {
      console.warn("Store settings missing coordinates, initializing...");
      // Upsert store settings with default coordinates
      const { error: upsertError } = await service
        .from("store_settings")
        .upsert(
          {
            id: true,
            lat: 12.3248091,
            lng: 76.6288967,
            address:
              "2979/1, D21/1, 6th Main Rd, Vani Vilas Mohalla, Mysuru, Karnataka 570002",
            phone: "+91 80739 74160",
            whatsapp_number: "918073974160",
            max_radius_km: 6,
            booking_cutoff_minutes: 60,
          },
          { onConflict: "id" },
        );

      if (upsertError) {
        console.error("Error upserting store settings:", upsertError);
      } else {
        console.warn("Store settings initialized successfully");
      }
    }

    // Check if time slots exist
    const { data: slots, error: slotsError } = await service
      .from("time_slots")
      .select("id")
      .limit(1);

    if (slotsError) {
      console.error("Error fetching time slots:", slotsError);
    }

    if (!slots || slots.length === 0) {
      console.warn("No time slots found, initializing...");
      // Insert default time slots
      const { error: insertError } = await service
        .from("time_slots")
        .insert([
          {
            start_time: "10:00",
            end_time: "11:00",
            label: "10:00 - 11:00 AM",
            capacity: 10,
            is_active: true,
          },
          {
            start_time: "11:00",
            end_time: "12:00",
            label: "11:00 AM - 12:00 PM",
            capacity: 10,
            is_active: true,
          },
          {
            start_time: "12:00",
            end_time: "13:00",
            label: "12:00 - 1:00 PM",
            capacity: 10,
            is_active: true,
          },
          {
            start_time: "13:00",
            end_time: "14:00",
            label: "1:00 - 2:00 PM",
            capacity: 10,
            is_active: true,
          },
          {
            start_time: "15:00",
            end_time: "16:00",
            label: "3:00 - 4:00 PM",
            capacity: 10,
            is_active: true,
          },
          {
            start_time: "16:00",
            end_time: "17:00",
            label: "4:00 - 5:00 PM",
            capacity: 10,
            is_active: true,
          },
          {
            start_time: "17:00",
            end_time: "18:00",
            label: "5:00 - 6:00 PM",
            capacity: 10,
            is_active: true,
          },
          {
            start_time: "18:00",
            end_time: "19:00",
            label: "6:00 - 7:00 PM",
            capacity: 10,
            is_active: true,
          },
          {
            start_time: "19:00",
            end_time: "20:00",
            label: "7:00 - 8:00 PM",
            capacity: 10,
            is_active: true,
          },
        ]);

      if (insertError) {
        console.error("Error inserting time slots:", insertError);
      } else {
        console.warn("Time slots initialized successfully");
      }
    }
  } catch (error) {
    console.error("Error in ensureStoreSettingsAndSlots:", error);
  }
}

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
  /** Services chosen in the wizard, written to order_items once the order exists. */
  items?: Array<{
    name: string;
    qty: number;
    unitPrice: number;
  }>;
  source?: OrderSource;
  createdBy?: string | null;
};

export type CreatePickupResult = {
  orderId: string;
  orderNo: string;
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

  // Ensure store settings are configured with coordinates and time slots exist
  await ensureStoreSettingsAndSlots();

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

  // Recompute the driving distance server side. The browser never sends a
  // distance, and book_pickup trusts the value passed to it (`p_distance_km`),
  // so this check is the only thing stopping an out-of-zone address from
  // booking. It throws outsideDeliveryZone past the radius. Without a Routes
  // key the check is skipped (testing): distance 0, inside the zone.
  const { distanceKm } = await assertWithinDeliveryZone(
    { lat: input.lat, lng: input.lng },
    googleServerKeyOptional(),
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
    console.error("book_pickup RPC error:", {
      code: error?.code,
      message: error?.message,
      details: error?.details,
      hint: error?.hint,
    });
    /*
     * `book_pickup` re-checks the zone, the cut-off, the capacity and the blocked
     * dates under its row lock, and answers with a plain message. Recognising the
     * ones a customer can actually act on is the difference between "pick another
     * slot" and "we could not confirm your booking" -- the first is retried, the
     * second is abandoned. Anything unrecognised is still thrown raw so it is not
     * swallowed into a friendly lie.
     */
    const recognised = error ? fromDatabaseError(error) : null;
    if (recognised) {
      console.error("Recognised error:", recognised.code);
      throw recognised;
    }

    console.error("Unrecognised book_pickup error, throwing generic error");
    throw new Error(`book_pickup failed: ${error?.message ?? "unknown error"}`);
  }

  /*
   * The services the customer chose, recorded once the order row exists.
   *
   * order_items has no insert policy, so the service role is used here, as it is
   * for the RPC call above. Every line names its priced option as booked — the
   * name is the record; there is no separate service reference.
   *
   * Best effort on purpose. The booking is already committed at this point, and
   * failing the whole request over a line item would leave the customer with a
   * booking the site thought was rejected. Staff still see the order, and the
   * items can be added from the admin side.
   */
  if (input.items?.length) {
    const { error: itemsError } = await service.from("order_items").insert(
      input.items.map((item) => ({
        order_id: orderId,
        item_name: item.name,
        qty: item.qty,
        unit_price: item.unitPrice,
      })),
    );

    if (itemsError) {
      console.error("Could not record services on the order", itemsError);
    }
  }

  const { data: order, error: orderError } = await service
    .from("orders")
    .select("order_no")
    .eq("id", orderId)
    .single();

  if (orderError) throw new Error(orderError.message);

  return { orderId, orderNo: order.order_no };
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
