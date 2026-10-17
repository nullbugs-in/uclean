import "server-only";

import {
  getStoreSettings,
  listActiveTimeSlots,
  listBlockedDates,
} from "@/db/queries/catalog";
import type { DbClient, TimeSlot } from "@/db/types";
import { fromDateKey, storeNow, toDateKey } from "@/lib/dates";

import { dateBlocked } from "./errors";

export type SlotAvailability = {
  slot: TimeSlot;
  booked: number;
  remaining: number;
  isFull: boolean;
  isPast: boolean;
  /** Inside the booking cut-off, so `book_pickup` would refuse it (section 8.10). */
  isTooSoon: boolean;
};

// Re-exported rather than moved: `book/actions.ts` and the walk-in page both
// read this from here, and `src/lib/dates.ts` owns the single definition now that
// slots.ts needs the store-aware clock anyway.
export { toDateKey };

/**
 * The cut-off used when the store row is missing or unreadable.
 *
 * Falling back to the documented rule rather than to zero is the point: zero
 * means "up to the minute", so a missing settings row would quietly switch the
 * rule off instead of degrading to what the brief asks for.
 */
export const DEFAULT_BOOKING_CUTOFF_MINUTES = 60;

const MINUTES_PER_DAY = 24 * 60;
const MS_PER_DAY = MINUTES_PER_DAY * 60_000;

/**
 * Whether `book_pickup` would refuse this slot for being inside the cut-off.
 *
 * Pure and exported so the rule can be pinned by a test. The wizard and the
 * database have to agree exactly, because a slot the wizard offers and the
 * database then rejects is a customer who filled in a whole form, placed a pin,
 * accepted a notice, and was still told no.
 *
 * Compared as a minute index rather than as a time of day so a cut-off that runs
 * past midnight still catches the next morning's early slots, instead of
 * wrapping around and freeing them by accident.
 */
export function isSlotTooSoon(
  dateKey: string,
  startMinutes: number,
  todayKey: string,
  nowMinutes: number,
  cutoffMinutes: number,
): boolean {
  const dayOffset = Math.round(
    (fromDateKey(dateKey).getTime() - fromDateKey(todayKey).getTime()) /
      MS_PER_DAY,
  );

  return (
    dayOffset * MINUTES_PER_DAY + startMinutes <= nowMinutes + cutoffMinutes
  );
}

/**
 * Slot availability for the booking wizard.
 *
 * Past slots for today are hidden rather than shown as full (section 6.2), and
 * a capacity of 0 means an admin has not configured the slot yet, so it reads
 * as unavailable instead of silently accepting bookings.
 *
 * A thin wrapper over the range read below, deliberately. The single-day and the
 * multi-day view used to compute availability twice, and the two only had to
 * disagree about one rule for the wizard to offer a slot the database refuses.
 */
export async function getSlotAvailability(
  client: DbClient,
  date: Date,
): Promise<SlotAvailability[]> {
  const dateKey = toDateKey(date);
  const day = (await getSlotsForRange(client, [dateKey])).get(dateKey);

  if (!day) return [];

  // A blocked date is a verdict on the whole day rather than a state of one
  // slot, so the range view reports it as a flag and this one has to throw it.
  if (day.isBlocked) throw dateBlocked(dateKey);

  return day.slots;
}

function toMinutes(time: string): number {
  const [hours = "0", minutes = "0"] = time.split(":");
  return Number(hours) * 60 + Number(minutes);
}

/** Slots a customer can actually pick right now. */
export function selectableSlots(
  availability: SlotAvailability[],
): SlotAvailability[] {
  return availability.filter(
    (entry) => !entry.isFull && !entry.isPast && !entry.isTooSoon,
  );
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
 * Turns the raw reads into per-date availability for an explicit list of days.
 *
 * The days are passed in rather than inferred. A date with no bookings at all is
 * the normal case, not an absent one: inferring the key set from the rows would
 * drop every empty day and read as "no slots configured" instead of "all slots
 * free", which would leave most of a booking calendar unselectable.
 *
 * Pure and exported so it can be tested without a database, and so the range
 * read and the single-day read above cannot drift apart: both call this, and so
 * both agree on what is full, what is past, what is too soon and what is
 * blocked.
 */
export function buildRangeAvailability(
  dateKeys: string[],
  slots: TimeSlot[],
  bookings: SlotBookingRow[],
  blockedDates: string[],
  todayKey: string,
  nowMinutes: number,
  cutoffMinutes: number,
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
        const startMinutes = toMinutes(slot.start_time);

        return {
          slot,
          booked,
          remaining: Math.max(0, slot.capacity - booked),
          isFull: slot.capacity === 0 || booked >= slot.capacity,
          isPast: isToday && startMinutes <= nowMinutes,
          isTooSoon: isSlotTooSoon(
            dateKey,
            startMinutes,
            todayKey,
            nowMinutes,
            cutoffMinutes,
          ),
        };
      }),
    });
  }

  return result;
}

/**
 * Availability across a range in four queries, however wide the range is.
 *
 * The single-date read above spends one query batch per date, which is why the
 * wizard historically only ever fetched a week. A range costs the same four no
 * matter how far ahead it reaches, because the active slots and the blocked
 * dates are both range-independent: `time_slots` describes recurring slots
 * rather than dated ones, and `slot_bookings` is the only dated table involved.
 *
 * The fourth query is the store row, for the booking cut-off. It is a singleton
 * read, so it costs the width of one row rather than the width of the range.
 */
export async function getSlotsForRange(
  client: DbClient,
  dateKeys: string[],
): Promise<RangeAvailability> {
  const fromKey = dateKeys[0];
  const toKey = dateKeys[dateKeys.length - 1];

  if (!fromKey || !toKey) return new Map();

  const [slots, bookings, blocked, store] = await Promise.all([
    listActiveTimeSlots(client),
    client
      .from("slot_bookings")
      .select("slot_id, slot_date")
      .gte("slot_date", fromKey)
      .lte("slot_date", toKey),
    listBlockedDates(client, fromKey, toKey),
    getStoreSettings(client),
  ]);

  if (bookings.error) throw new Error(bookings.error.message);

  // The store's clock, not the process's: a mismatch here is what would let the
  // wizard offer a slot the database has already closed.
  const now = storeNow();

  return buildRangeAvailability(
    dateKeys,
    slots,
    (bookings.data ?? []) as SlotBookingRow[],
    blocked,
    toDateKey(now),
    now.getHours() * 60 + now.getMinutes(),
    store?.booking_cutoff_minutes ?? DEFAULT_BOOKING_CUTOFF_MINUTES,
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
