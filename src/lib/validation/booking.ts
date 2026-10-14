import { z } from "zod";

export const zoneNoticeSchema = z.object({
  accepted: z.literal(true),
  acceptedAt: z.string().datetime().optional(),
});

export type ZoneNoticeInput = z.infer<typeof zoneNoticeSchema>;

export const createPickupSchema = z.object({
  customerId: z.string().uuid(),
  address: z.string().min(5, "Please enter the full pickup address."),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  whatsappNumber: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  slotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slotId: z.string().uuid(),
  zoneNoticeAcceptedAt: z.string().datetime(),
  source: z.enum(["online", "walk_in"]).optional(),
  createdBy: z.string().uuid().optional().nullable(),
});

export type CreatePickupInput = z.infer<typeof createPickupSchema>;
