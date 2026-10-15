"use server";

import { createClient } from "@/db/server";
import type { Address, DbClient } from "@/db/types";
import { pickupRequestSchema } from "@/lib/validation";
import { getAuthUser } from "@/server/auth";
import { DomainError } from "@/server/errors";
import { createPickupOrder } from "@/server/orders";
import {
  getSlotAvailability,
  selectableSlots,
  toDateKey,
  type SlotAvailability,
} from "@/server/slots";

import type { ActionResult, SlotDay, SlotOption } from "./types";

/** How many days ahead the slot picker offers. */
const SLOT_WINDOW_DAYS = 7;

function toOption(entry: SlotAvailability): SlotOption {
  return {
    id: entry.slot.id,
    label:
      entry.slot.label ?? `${entry.slot.start_time} - ${entry.slot.end_time}`,
    startTime: entry.slot.start_time,
    remaining: entry.remaining,
  };
}

async function buildDay(supabase: DbClient, date: Date): Promise<SlotDay> {
  const dateKey = toDateKey(date);

  try {
    const availability = await getSlotAvailability(supabase, date);
    return {
      dateKey,
      isBlocked: false,
      slots: selectableSlots(availability).map(toOption),
    };
  } catch (error) {
    // A blocked date is a normal state the picker renders, not a failure.
    if (error instanceof DomainError && error.code === "DATE_BLOCKED") {
      return { dateKey, isBlocked: true, slots: [] };
    }
    throw error;
  }
}

/**
 * The next seven days of pickup availability, fetched once after sign-in.
 *
 * One action rather than seven: Server Actions dispatch sequentially from the
 * client, so a per-day call would waterfall. The authoritative capacity check
 * still happens under a row lock inside book_pickup, so this read may briefly
 * disagree with a concurrent booking.
 */
export async function listWeekSlotsAction(): Promise<ActionResult<SlotDay[]>> {
  try {
    const supabase = await createClient();
    const today = new Date();

    const days = await Promise.all(
      Array.from({ length: SLOT_WINDOW_DAYS }, (_, offset) => {
        const date = new Date(today);
        date.setDate(today.getDate() + offset);
        return buildDay(supabase, date);
      }),
    );

    return { ok: true, data: days };
  } catch (error) {
    console.error("Could not load pickup slots", error);
    return {
      ok: false,
      message: "We could not load the available slots. Please try again.",
    };
  }
}

export type CreateBookingInput = {
  address: string;
  lat: number;
  lng: number;
  notes?: string;
  /** YYYY-MM-DD */
  slotDate: string;
  slotId: string;
  zoneNoticeAcceptedAt: string;
  /** Services chosen in the wizard, written to the order's line items. */
  items: Array<{ name: string; qty: number; unitPrice: number }>;
};

/** Shortest address the wizard accepts, mirrored from the address step. */
const MIN_ADDRESS_LENGTH = 10;

/**
 * Stores the pickup address on the customer's profile.
 *
 * Called after the booking succeeds so the address the customer actually
 * confirmed is the one saved. The customer's first saved address becomes their
 * default; afterwards the newest booking's address is the default, since that
 * is the one they most recently told us to collect from.
 *
 * Written through the request-scoped client so the `addresses_all_owner` RLS
 * policy is the only thing standing between the customer and the table.
 */
export async function saveAddressAction(input: {
  addressText: string;
  lat: number;
  lng: number;
}): Promise<ActionResult<{ addressId: string }>> {
  const addressText = input.addressText.trim();

  if (addressText.length < MIN_ADDRESS_LENGTH) {
    return {
      ok: false,
      message: "Please enter your full pickup address before saving it.",
    };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        ok: false,
        message:
          "Your session has expired. Please verify your mobile number again.",
      };
    }

    const saved = await upsertDefaultAddress(
      supabase,
      user.id,
      addressText,
      input.lat,
      input.lng,
    );

    return { ok: true, data: { addressId: saved.id } };
  } catch (error) {
    console.error("Could not save the pickup address", error);
    return {
      ok: false,
      message: "We could not save this address. You can still book a pickup.",
    };
  }
}

/**
 * Saves the address, keeping exactly one default per customer.
 *
 * The `addresses_one_default_per_user` partial unique index means a second
 * default would be rejected outright, so any existing default is cleared
 * first. An identical saved address is reused rather than duplicated, so
 * booking from the same flat ten times does not fill the profile with copies.
 */
async function upsertDefaultAddress(
  supabase: DbClient,
  userId: string,
  addressText: string,
  lat: number,
  lng: number,
): Promise<Address> {
  const { data: existing, error: listError } = await supabase
    .from("addresses")
    .select("*")
    .eq("user_id", userId);

  if (listError) throw new Error(listError.message);

  const addresses = existing ?? [];
  const same = addresses.find(
    (entry) => entry.address_text.trim() === addressText,
  );

  const { error: clearError } = await supabase
    .from("addresses")
    .update({ is_default: false })
    .eq("user_id", userId)
    .eq("is_default", true);

  if (clearError) throw new Error(clearError.message);

  if (same) {
    const { data: updated, error: updateError } = await supabase
      .from("addresses")
      .update({ is_default: true, lat, lng })
      .eq("id", same.id)
      .select("*")
      .single();

    if (updateError) throw new Error(updateError.message);
    return updated;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("addresses")
    .insert({
      user_id: userId,
      label: "Pickup address",
      address_text: addressText,
      lat,
      lng,
      is_default: true,
    })
    .select("*")
    .single();

  if (insertError) throw new Error(insertError.message);
  return inserted;
}

/**
 * Confirms a pickup booking for the signed-in customer.
 *
 * `createPickupOrder` re-reads the name and mobile from the profile and
 * recomputes the driving distance server side, so nothing here is trusted from
 * the browser beyond the chosen address, slot and notice timestamp.
 */
export async function createBookingAction(
  input: CreateBookingInput,
): Promise<ActionResult<{ orderId: string; orderNo: string }>> {
  const parsed = pickupRequestSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ??
        "Please check your details and try again.",
    };
  }

  const user = await getAuthUser();
  if (!user) {
    return {
      ok: false,
      message:
        "Your session has expired. Please verify your mobile number again.",
    };
  }

  try {
    const result = await createPickupOrder({
      customerId: user.id,
      address: parsed.data.address,
      lat: parsed.data.lat,
      lng: parsed.data.lng,
      notes: parsed.data.notes || null,
      slotDate: parsed.data.slotDate,
      slotId: parsed.data.slotId,
      zoneNoticeAcceptedAt: parsed.data.zoneNoticeAcceptedAt,
      items: parsed.data.items,
    });

    // The booking is committed at this point, so saving the address is a
    // convenience write and must never turn a confirmed booking into an error.
    const saved = await saveAddressAction({
      addressText: parsed.data.address,
      lat: parsed.data.lat,
      lng: parsed.data.lng,
    });

    if (!saved.ok) {
      console.warn(
        "Booking placed but the address was not saved",
        saved.message,
      );
    }

    return { ok: true, data: result };
  } catch (error) {
    if (error instanceof DomainError) {
      return { ok: false, message: error.userMessage };
    }

    console.error("Pickup booking failed", error);
    return {
      ok: false,
      message:
        "We could not confirm your booking. Please try again or contact us on WhatsApp.",
    };
  }
}
