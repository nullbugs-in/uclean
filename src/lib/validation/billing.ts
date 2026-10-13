import { z } from "zod";

/** Line items recorded by admin at the store (section 8.4). */
export const orderItemSchema = z.object({
  serviceId: z.string().uuid().optional().or(z.literal("")),
  itemName: z.string().trim().min(1, "Item name is required").max(160),
  qty: z.coerce.number().positive("Quantity must be more than zero"),
  unitPrice: z.coerce.number().min(0, "Price cannot be negative"),
  notes: z.string().trim().max(300).optional().or(z.literal("")),
  photoUrl: z.string().url().optional().or(z.literal("")),
});

export type OrderItemInput = z.infer<typeof orderItemSchema>;

const money = z.coerce.number().min(0, "Amount cannot be negative");

/** Invoice header (section 8.4). total is derived, never trusted from input. */
export const invoiceSchema = z.object({
  orderId: z.string().uuid(),
  subtotal: money,
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
