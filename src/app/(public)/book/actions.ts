"use server";

import { createClient } from "@/db/server";
import { pickupRequestSchema } from "@/lib/validation";
import { getPrefillAddress, saveDefaultAddress } from "@/server/addresses";
import { getAuthUser } from "@/server/auth";
import { DomainError } from "@/server/errors";
import { createPickupOrder } from "@/server/orders";
import {
  getSlotsForRange,
  selectableSlots,
  toDateKey,
  type SlotAvailability,
} from "@/server/slots";

import type { ActionResult, SlotDay, SlotOption } from "./types";

/**
 * How many days ahead the slot picker offers.
 *
 * This is the whole bookable horizon, not the width of the quick-pick strip:
 * the strip renders the first seven of these and the calendar icon renders all
 * of them. Availability exists for any future date, because `time_slots`
 * describes recurring slots rather than dated ones, so this number is a product
 * decision about how far ahead a customer may book rather than a limit of the
 * data. Reading it costs the same three queries at any width.
 */
const SLOT_WINDOW_DAYS = 60;

function toOption(entry: SlotAvailability): SlotOption {
  return {
    id: entry.slot.id,
    label:
      entry.slot.label ?? `${entry.slot.start_time} - ${entry.slot.end_time}`,
    startTime: entry.slot.start_time,
    remaining: entry.remaining,
  };
}

/** Today plus the next {@link SLOT_WINDOW_DAYS} date keys, oldest first. */
function upcomingDateKeys(count: number): string[] {
  const today = new Date();

  return Array.from({ length: count }, (_, offset) => {
    const date = new Date(today);
    date.setDate(today.getDate() + offset);
    return toDateKey(date);
  });
}

/**
 * Pickup availability for the whole bookable horizon, fetched once.
 *
 * One action rather than one per date: Server Actions dispatch sequentially from
 * the client, so a per-day call would waterfall. One ranged read also costs the
 * same three queries however far ahead it reaches.
 *
 * The authoritative capacity check still happens under a row lock inside
 * book_pickup, so this read may briefly disagree with a concurrent booking.
 */
export async function listUpcomingSlotsAction(): Promise<
  ActionResult<SlotDay[]>
> {
  try {
    const supabase = await createClient();
    const dateKeys = upcomingDateKeys(SLOT_WINDOW_DAYS);
    const availability = await getSlotsForRange(supabase, dateKeys);

    return {
      ok: true,
      data: dateKeys.map((dateKey) => {
        const day = availability.get(dateKey);

        return {
          dateKey,
          // A blocked date is a state the picker renders, not a failure, so it
          // arrives here as data rather than as a thrown error.
          isBlocked: day?.isBlocked ?? false,
          slots: selectableSlots(day?.slots ?? []).map(toOption),
        };
      }),
    };
  } catch (error) {
    console.error("Could not load pickup slots", error);
    return {
      ok: false,
      message: "We could not load the available slots. Please try again.",
    };
  }
}

/**
 * Stores the pickup address on the customer's profile.
 *
 * Called from two places, deliberately. The wizard calls it as soon as the
 * customer leaves the address step, so the address is kept even if they abandon
 * the booking at the slot or confirm step. `createBookingAction` calls it again
 * after the booking commits, as a backstop for the case where that earlier write
 * failed or did not happen. Both go through `saveDefaultAddress`, which reuses
 * an equivalent row rather than inserting, so running it twice is harmless.
 *
 * Exported because the wizard calls it; every other write lives in
 * `src/server/addresses.ts`.
 */
export async function saveAddressAction(input: {
  addressText: string;
  lat: number;
  lng: number;
}): Promise<ActionResult<{ addressId: string }>> {
  const user = await getAuthUser();

  if (!user) {
    return {
      ok: false,
      message:
        "Your session has expired. Please verify your mobile number again.",
    };
  }

  try {
    const supabase = await createClient();
    const saved = await saveDefaultAddress(supabase, user.id, {
      addressText: input.addressText,
      lat: input.lat,
      lng: input.lng,
    });

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
 * The saved pickup address, for the wizard to prefill once the customer is known.
 *
 * This exists because of a sequencing problem rather than a missing feature.
 * `/book` renders on arrival, and someone arriving to book a pickup is usually
 * signed out at that point, so the server render had no session and could offer
 * no address. Verifying their number afterwards does not re-render the page, so
 * without this the prefill only ever worked for someone who happened to already
 * be signed in when they clicked Book Now.
 *
 * Returns an empty string rather than null when nothing is saved, which is the
 * ordinary first-time case.
 */
export async function getSavedAddressAction(): Promise<
  ActionResult<{ addressText: string }>
> {
  const user = await getAuthUser();

  if (!user) {
    return { ok: false, message: "Please verify your mobile number first." };
  }

  try {
    const supabase = await createClient();
    const address = await getPrefillAddress(supabase, user.id);

    return { ok: true, data: { addressText: address?.address_text ?? "" } };
  } catch (error) {
    // A failed read is not worth failing the wizard over: the address step still
    // works, the field just starts empty.
    console.warn("Could not load the saved pickup address", error);
    return { ok: true, data: { addressText: "" } };
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

/**
 * Confirms a pickup booking for the signed-in customer.
 *
 * `createPickupOrder` re-reads the name and mobile from the profile, so nothing
 * here is trusted from the browser beyond the chosen address, slot and notice
 * timestamp. The driving distance is not recomputed yet: the zone check is
 * switched off in `src/server/orders.ts` pending the real location flow.
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
