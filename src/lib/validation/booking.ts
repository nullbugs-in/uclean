import { z } from "zod";

import { MAX_ADDRESS_LENGTH, MIN_ADDRESS_LENGTH } from "@/lib/address";

import { mobileSchema } from "./auth";

/**
 * A pickup address, long enough that it is worth sending someone to.
 *
 * The length rule lives in `@/lib/address` so the schema, the address step's
 * Continue button and the save path all agree on it. They used to state the
 * number separately in three places, which is exactly the kind of duplication
 * that ends with a customer told their address is fine by one screen and too
 * short by another.
 */
export const addressSchema = z
  .string()
  .trim()
  .min(MIN_ADDRESS_LENGTH, "Enter your full pickup address")
  .max(MAX_ADDRESS_LENGTH, "That address is too long");

/**
 * Step 1 of the booking wizard (section 6.2). Name and mobile are prefilled
 * from the profile rather than typed, so they are not part of this schema.
 */
export const bookingDetailsSchema = z.object({
  address: addressSchema,
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

/** One service line the customer chose, as it will be stored on the order. */
export const bookingItemSchema = z.object({
  name: z.string().trim().min(1, "Name each service").max(160),
  qty: z.number().positive().max(99),
  unitPrice: z.number().min(0),
});

/**
 * The public `/book` wizard submit.
 *
 * Distinct from `bookPickupSchema`: `slotDate` stays a `YYYY-MM-DD` string all
 * the way to Postgres. Coercing it to a `Date` and back is what makes a server
 * running west of UTC shift the pickup back a day, so this schema never does
 * that conversion in the first place.
 */
export const pickupRequestSchema = z.object({
  address: addressSchema,
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
  slotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a pickup date"),
  slotId: z.string().uuid("Choose a pickup slot"),
  zoneNoticeAcceptedAt: z.string().datetime(),
  // Chosen in step 3. Capped so a crafted payload cannot flood the order.
  items: z.array(bookingItemSchema).max(30, "Too many services selected"),
});

export type PickupRequestInput = z.infer<typeof pickupRequestSchema>;
