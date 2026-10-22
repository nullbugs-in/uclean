import { z } from "zod";

/**
 * Billing payloads.
 *
 * The catalogue-based invoice draft schema is gone: invoices are generated from
 * a booking's own lines, where the server reads the figures from what the
 * booking recorded. What remains here covers payment and status actions over an
 * invoice that already exists.
 */

const money = z.coerce.number().min(0, "Amount cannot be negative");

/** Cash on Delivery recorded by the delivery agent (section 6.4). */
export const codSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: money.positive("Enter the amount collected"),
});

export type CodInput = z.infer<typeof codSchema>;

/** Manual status change from an admin or staff button. */
export const statusChangeSchema = z.object({
  orderId: z.string().uuid(),
  toStatus: z.string().min(1),
  note: z.string().trim().max(300).optional().or(z.literal("")),
});

export type StatusChangeInput = z.infer<typeof statusChangeSchema>;
