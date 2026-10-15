"use server";

import { createClient } from "@/db/server";
import type { DbClient } from "@/db/types";
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
};

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
    });

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
