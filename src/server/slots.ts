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
  isCutOff: boolean;
};

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toMinutes(time: string): number {
  const [hours = "0", minutes = "0"] = time.split(":");
  return Number(hours) * 60 + Number(minutes);
}

export async function getSlotAvailability(
  client: DbClient,
  date: Date,
  now: Date = new Date(),
): Promise<SlotAvailability[]> {
  const dateKey = toDateKey(date);
  const isToday = dateKey === toDateKey(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowIso = now.toISOString();

  const [slots, bookings, blocked, settings] = await Promise.all([
    listActiveTimeSlots(client),
    client.from("slot_bookings").select("slot_id").eq("slot_date", dateKey),
    listBlockedDates(client, dateKey, dateKey),
    client.from("store_settings").select("cut_off_minutes").eq("id", true).maybeSingle(),
  ]);

  if (bookings.error) throw new Error(bookings.error.message);
  if (settings.error) throw new Error(settings.error.message);

  if (blocked.includes(dateKey)) {
    throw dateBlocked(dateKey);
  }

  const counts = new Map<string, number>();
  for (const row of bookings.data ?? []) {
    counts.set(row.slot_id, (counts.get(row.slot_id) ?? 0) + 1);
  }

  const cutOffMinutes = settings.data?.cut_off_minutes ?? 60;

  return slots.map((slot) => {
    const booked = counts.get(slot.id) ?? 0;
    const slotStart = toMinutes(slot.start_time);
    const slotStartDate = new Date(
      `${dateKey}T${slot.start_time.slice(0, 5)}:00`,
    );
    const cutOffAt = new Date(slotStartDate.getTime() - cutOffMinutes * 60 * 1000);
    const isPast = isToday && slotStart <= nowMinutes;
    const isCutOff = cutOffMinutes > 0 && new Date(nowIso) >= cutOffAt;

    return {
      slot,
      booked,
      remaining: Math.max(0, slot.capacity - booked),
      isFull: slot.capacity === 0 || booked >= slot.capacity,
      isPast,
      isCutOff,
    };
  });
}

export function selectableSlots(
  availability: SlotAvailability[],
): SlotAvailability[] {
  return availability.filter((entry) => !entry.isFull && !entry.isPast && !entry.isCutOff);
}

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
