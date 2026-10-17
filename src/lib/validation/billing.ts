import { z } from "zod";

/**
 * Billing payloads (section 8.4).
 *
 * The shape of a line changed when `services` became the billing catalogue: a
 * line is now a *reference* to a catalogue row plus a quantity, and carries no
 * name and no price. Both are read from `services` on the server, so the client
 * cannot name a price it likes. That is why `unitPrice` is gone from the schema
 * rather than merely ignored.
 */

/** A billable line: a catalogue service and a quantity. */
export const orderItemSchema = z.object({
  serviceId: z.string().uuid("Choose a service"),
  qty: z.coerce.number().positive("Quantity must be more than zero"),
  notes: z.string().trim().max(300).optional().or(z.literal("")),
  photoUrl: z.string().url().optional().or(z.literal("")),
});

export type OrderItemInput = z.infer<typeof orderItemSchema>;

const money = z.coerce.number().min(0, "Amount cannot be negative");

/**
 * Invoice header (section 8.4).
 *
 * Line prices, the subtotal and the total are derived on the server from the
 * catalogue and the lines, so none of them is accepted here.
 */
export const invoiceSchema = z.object({
  orderId: z.string().uuid(),
  tax: money,
  discount: money,
  deliveryCharge: money,
  items: z.array(orderItemSchema).min(1, "Add at least one item"),
});

export type InvoiceInput = z.infer<typeof invoiceSchema>;

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
