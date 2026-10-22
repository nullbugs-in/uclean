import { z } from "zod";

import { mobileSchema } from "./auth";
import { bookingItemSchema, pickupRequestSchema } from "./booking";

/**
 * Walk-in management (section 8.11): "a staff member can create an order for a
 * walk-in customer without online booking, using the same services and slots as
 * online orders".
 *
 * The name and mobile are the two fields the counter actually types, and they are
 * the only part of a walk-in that does not exist anywhere else. Everything else
 * reuses the public wizard's submit shape so the two cannot drift.
 */
export const walkInCustomerSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the customer's name").max(120),
  mobile: mobileSchema,
});

export type WalkInCustomerInput = z.infer<typeof walkInCustomerSchema>;

/**
 * One line the counter books, straight from the wizard.
 *
 * A walk-in is authored from the same price list the website shows — the
 * Regular/Express lists in `src/data/pricing.ts` — so a line carries the name
 * the customer sees and the figure it will be billed at, and no `services`
 * reference. That is exactly an online booking's line, which is the point: the
 * invoice prices a walk-in the same way it prices every other booking.
 */

/**
 * The full walk-in submit.
 *
 * The order half is `pickupRequestSchema` unchanged, which is the point: a
 * walk-in is an ordinary pickup with `source = walk_in`, so it takes the same
 * slot capacity lock, the same zone check and the same line-item shape as an
 * online booking. Adding a second definition of those rules would be a second
 * place for them to be wrong.
 *
 * `items` is overridden to require at least one line. The public wizard allows an
 * empty basket because a customer may be browsing; a walk-in is entered by staff
 * who have just been told what the customer wants, and an order with no lines is
 * an invoice nobody can write.
 */
export const walkInRequestSchema = pickupRequestSchema.extend({
  fullName: walkInCustomerSchema.shape.fullName,
  mobile: walkInCustomerSchema.shape.mobile,
  items: z
    .array(bookingItemSchema)
    .min(1, "Add at least one service")
    .max(30, "Too many services selected"),
});

export type WalkInRequestInput = z.infer<typeof walkInRequestSchema>;

/**
 * A lookup of a mobile number at the counter, before the order is composed.
 *
 * Optional on purpose: the counter can type a name and number and press Enter, and
 * the server decides then whether the number is new. This exists so the form can
 * say "that is Asha Menon, you have booked for her before" — which is what stops a
 * regular being given a second account by a typo.
 */
export const walkInLookupSchema = z.object({ mobile: mobileSchema });

export type WalkInLookupInput = z.infer<typeof walkInLookupSchema>;
