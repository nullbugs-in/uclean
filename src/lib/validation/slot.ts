import { z } from "zod";

/**
 * Time slot settings, as the admin Slots page submits them.
 *
 * Separated from the action that consumes it so the rules can be tested without
 * loading `next/cache` and the auth stack, the same split `store.ts` and
 * `booking.ts` use.
 *
 * Capacity 0 is a real value and not "missing": the database treats it as the
 * slot being full, which is how an admin closes a slot without deleting it, so
 * the schema accepts it and only rejects a negative or fractional number.
 */

const capacity = z
  .number({
    invalid_type_error: "Enter a capacity for every slot, 0 to close it",
  })
  .int("Capacity must be a whole number of pickups")
  .min(0, "Capacity cannot be negative")
  .max(500, "That capacity looks too high for one slot");

export const slotSettingsSchema = z.object({
  slots: z
    .array(
      z.object({
        id: z.string().min(1, "That slot is not recognised"),
        capacity,
        label: z.string().trim().max(60, "That label is too long").nullable(),
        isActive: z.boolean(),
      }),
    )
    .min(1, "There are no slots to save"),
});

export type SlotSettingsInput = z.input<typeof slotSettingsSchema>;
export type SlotSettingsValues = z.output<typeof slotSettingsSchema>;

/**
 * The booking cut-off, as the admin Slots page submits it.
 *
 * 0 is a real value rather than "missing": it means a pickup may be booked right
 * up to the minute its slot starts. The upper bound is a sanity bound and not a
 * business rule -- anything past half a day is the wrong number, and the same
 * pair of bounds is on the column, so a value this accepts is one the database
 * will store.
 */
export const bookingRulesSchema = z.object({
  cutoffMinutes: z
    .number({ invalid_type_error: "Enter the cut-off in whole minutes" })
    .int("The cut-off must be a whole number of minutes")
    .min(0, "The cut-off cannot be negative")
    .max(720, "A cut-off longer than 12 hours would close the whole day"),
});

export type BookingRulesInput = z.input<typeof bookingRulesSchema>;
export type BookingRulesValues = z.output<typeof bookingRulesSchema>;

/** True for a real YYYY-MM-DD calendar date, rejecting things like 2026-02-31. */
function isCalendarDate(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return false;

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * A blocked date (a store holiday), as the admin Slots page submits it.
 *
 * The reason is optional and for the admin's own reference: the booking flow
 * only ever reads the date itself, so a blank reason costs nothing.
 */
export const blockedDateSchema = z.object({
  date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date as YYYY-MM-DD")
    .refine(isCalendarDate, "That date does not exist"),
  reason: z.string().trim().max(120, "That reason is too long").nullable(),
});

export type BlockedDateInput = z.input<typeof blockedDateSchema>;
export type BlockedDateValues = z.output<typeof blockedDateSchema>;
