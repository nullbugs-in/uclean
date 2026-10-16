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

/** One row of `slot_bookings`, as far as availability is concerned. */
export type SlotBookingRow = { slot_id: string; slot_date: string };

/**
 * Availability for one date in a range.
 *
 * `isBlocked` is held apart from an empty `slots` list because the two read
 * differently to a customer: a blocked date is a day the store is closed, while
 * an empty list is a day whose slots are configured but all taken.
 */
export type DayAvailability = {
  isBlocked: boolean;
  slots: SlotAvailability[];
};

/**
 * Availability across a range, keyed by YYYY-MM-DD.
 *
 * Keyed by the requested days rather than by the days that happen to carry rows,
 * so a caller can look up any date in the window in one step.
 */
export type RangeAvailability = Map<string, DayAvailability>;

/**
 * Turns three raw reads into per-date availability for an explicit list of days.
 *
 * The days are passed in rather than inferred. A date with no bookings at all is
 * the normal case, not an absent one: inferring the key set from the rows would
 * drop every empty day and read as "no slots configured" instead of "all slots
 * free", which would leave most of a booking calendar unselectable.
 *
 * Pure and exported so it can be tested without a database, and so the range
 * read and the single-day read above cannot drift apart: both call this, and so
 * both agree on what is full, what is past and what is blocked.
 */
export function buildRangeAvailability(
  dateKeys: string[],
  slots: TimeSlot[],
  bookings: SlotBookingRow[],
  blockedDates: string[],
  todayKey: string,
  nowMinutes: number,
): RangeAvailability {
  const blocked = new Set(blockedDates);

  // One pass over the bookings, counted per date and slot, rather than a count
  // query per slot per date.
  const counts = new Map<string, number>();
  for (const row of bookings) {
    const key = `${row.slot_date}/${row.slot_id}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const result: RangeAvailability = new Map();

  for (const dateKey of dateKeys) {
    if (blocked.has(dateKey)) {
      result.set(dateKey, { isBlocked: true, slots: [] });
      continue;
    }

    const isToday = dateKey === todayKey;

    result.set(dateKey, {
      isBlocked: false,
      slots: slots.map((slot) => {
        const booked = counts.get(`${dateKey}/${slot.id}`) ?? 0;

        return {
          slot,
          booked,
          remaining: Math.max(0, slot.capacity - booked),
          isFull: slot.capacity === 0 || booked >= slot.capacity,
          isPast: isToday && toMinutes(slot.start_time) <= nowMinutes,
        };
      }),
    });
  }

  return result;
}

/**
 * Availability across a range in three queries, however wide the range is.
 *
 * The single-date read above spends three queries per date, which is why the
 * wizard historically only ever fetched a week. A range costs the same three no
 * matter how far ahead it reaches, because the active slots and the blocked
 * dates are both range-independent: `time_slots` describes recurring slots
 * rather than dated ones, and `slot_bookings` is the only dated table involved.
 */
export async function getSlotsForRange(
  client: DbClient,
  dateKeys: string[],
): Promise<RangeAvailability> {
  const fromKey = dateKeys[0];
  const toKey = dateKeys[dateKeys.length - 1];

  if (!fromKey || !toKey) return new Map();

  const [slots, bookings, blocked] = await Promise.all([
    listActiveTimeSlots(client),
    client
      .from("slot_bookings")
      .select("slot_id, slot_date")
      .gte("slot_date", fromKey)
      .lte("slot_date", toKey),
    listBlockedDates(client, fromKey, toKey),
  ]);

  if (bookings.error) throw new Error(bookings.error.message);

  const now = new Date();

  return buildRangeAvailability(
    dateKeys,
    slots,
    (bookings.data ?? []) as SlotBookingRow[],
    blocked,
    toDateKey(now),
    now.getHours() * 60 + now.getMinutes(),
  );
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
