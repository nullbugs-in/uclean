import { z } from "zod";

/**
 * A service on the billing catalogue, as the admin Services page submits it.
 *
 * This is the table invoicing prices from, so the rules that matter are the ones
 * that keep a bad price out. A price of 0 is deliberately valid -- a free or
 * promotional line -- while a negative or non-numeric one is not.
 *
 * Separated from the action that consumes it so the rules can be tested without
 * loading `next/cache` and the auth stack, the same split the other schemas use.
 */

const name = z
  .string()
  .trim()
  .min(1, "Give the service a name")
  .max(120, "That name is too long");

const unit = z
  .string()
  .trim()
  .min(1, "Give the unit, e.g. kg, piece or pair")
  .max(20, "That unit is too long");

const price = z.coerce
  .number({ invalid_type_error: "Enter a price, 0 for a free line" })
  .min(0, "Price cannot be negative")
  .max(100000, "That price looks too high");

const sortOrder = z.coerce
  .number({ invalid_type_error: "Sort order must be a number" })
  .int("Sort order must be a whole number")
  .min(0, "Sort order cannot be negative")
  .max(9999, "That sort order looks too high");

export const serviceSchema = z.object({
  name,
  description: z
    .string()
    .trim()
    .max(400, "That description is too long")
    .nullable(),
  unit,
  price,
  imageUrl: z.string().trim().max(500, "That image path is too long").nullable(),
  isActive: z.boolean(),
  sortOrder,
});

export type ServiceInput = z.input<typeof serviceSchema>;
export type ServiceValues = z.output<typeof serviceSchema>;
