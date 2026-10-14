import { z } from "zod";

import { mobileSchema } from "./auth";

/**
 * Step 1 of the booking wizard (section 6.2). Name and mobile are prefilled
 * from the profile rather than typed, so they are not part of this schema.
 */
export const bookingDetailsSchema = z.object({
  address: z.string().trim().min(10, "Enter your full pickup address").max(500),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  email: z
    .string()
    .trim()
    .email("Enter a valid email")
    .optional()
    .or(z.literal("")),
  whatsappNumber: mobileSchema.optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export type BookingDetailsInput = z.infer<typeof bookingDetailsSchema>;

/** Step 0: the 6 km notice must be accepted, and we record when. */
export const zoneNoticeSchema = z.object({
  accepted: z.literal(true, {
    errorMap: () => ({ message: "Please accept the delivery area notice" }),
  }),
});

/** Step 3: slot choice. */
export const slotBookingSchema = z.object({
  slotDate: z.coerce.date(),
  slotId: z.string().uuid("Choose a pickup slot"),
});

export type SlotBookingInput = z.infer<typeof slotBookingSchema>;

/**
 * The final submit. The distance is deliberately absent: it is computed
 * server side from lat/lng via the Routes API and must never be accepted from
 * the browser.
 */
export const bookPickupSchema = bookingDetailsSchema.extend({
  slotDate: z.coerce.date(),
  slotId: z.string().uuid("Choose a pickup slot"),
  zoneNoticeAcceptedAt: z.string().datetime(),
});

export type BookPickupInput = z.infer<typeof bookPickupSchema>;
