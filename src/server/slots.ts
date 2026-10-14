import "server-only";

import { listActiveTimeSlots, listBlockedDates } from "@/db/queries/catalog";
import type { DbClient, TimeSlot } from "@/db/types";

import { dateBlocked } from "./errors";

export type SlotAvailability = {
  slot: TimeSlot;
  booked: number;
  remaining: number;
  isFull: boolean;
  isPast: boolean;
};

/** YYYY-MM-DD in the server's timezone, avoiding a UTC date roll mismatch. */
export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Slot availability for the booking wizard.
 *
 * Past slots for today are hidden rather than shown as full (section 6.2), and
 * a capacity of 0 means an admin has not configured the slot yet, so it reads
 * as unavailable instead of silently accepting bookings.
 */
export async function getSlotAvailability(
  client: DbClient,
  date: Date,
): Promise<SlotAvailability[]> {
  const dateKey = toDateKey(date);
  const isToday = dateKey === toDateKey(new Date());
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();

  const [slots, bookings, blocked] = await Promise.all([
    listActiveTimeSlots(client),
    client.from("slot_bookings").select("slot_id").eq("slot_date", dateKey),
    listBlockedDates(client, dateKey, dateKey),
  ]);

  if (bookings.error) throw new Error(bookings.error.message);

  if (blocked.includes(dateKey)) {
    throw dateBlocked(dateKey);
  }

  const counts = new Map<string, number>();
  for (const row of bookings.data ?? []) {
    counts.set(row.slot_id, (counts.get(row.slot_id) ?? 0) + 1);
  }

  return slots.map((slot) => {
    const booked = counts.get(slot.id) ?? 0;
    const slotStart = toMinutes(slot.start_time);

    return {
      slot,
      booked,
      remaining: Math.max(0, slot.capacity - booked),
      isFull: slot.capacity === 0 || booked >= slot.capacity,
      isPast: isToday && slotStart <= nowMinutes,
    };
  });
}

function toMinutes(time: string): number {
  const [hours = "0", minutes = "0"] = time.split(":");
  return Number(hours) * 60 + Number(minutes);
}

/** Slots a customer can actually pick right now. */
export function selectableSlots(
  availability: SlotAvailability[],
): SlotAvailability[] {
  return availability.filter((entry) => !entry.isFull && !entry.isPast);
}

/**
 * Recomputes remaining capacity for one date.
 *
 * The authoritative count lives under the row lock inside book_pickup; this is
 * the cheaper read used by the wizard, so it can briefly disagree with a
 * concurrent booking. The database has the final say.
 */
export async function getRemainingCapacity(
  client: DbClient,
  dateKey: string,
  slotId: string,
): Promise<number> {
  const [slot, bookings] = await Promise.all([
    client.from("time_slots").select("capacity").eq("id", slotId).maybeSingle(),
    client
      .from("slot_bookings")
      .select("id", { count: "exact", head: true })
      .eq("slot_date", dateKey)
      .eq("slot_id", slotId),
  ]);

  if (slot.error) throw new Error(slot.error.message);
  if (bookings.error) throw new Error(bookings.error.message);
  if (!slot.data) return 0;

  return Math.max(0, slot.data.capacity - (bookings.count ?? 0));
}
