import { z } from "zod";

/**
 * Store settings, as the admin Settings form submits them.
 *
 * Separated from the action that consumes it so the rules can be tested without
 * loading `next/cache` and the auth stack, the same split the booking and billing
 * schemas use.
 *
 * `null` is a real value here and not a placeholder for "missing": an admin may
 * legitimately clear the store coordinates or the GSTIN. The one rule that ties
 * two fields together is the coordinate pair, because a store measured from a
 * latitude with no longitude is not a place.
 */

const latitude = z
  .number({ invalid_type_error: "Enter a latitude like 12.3248" })
  .min(-90, "Latitude must be between -90 and 90")
  .max(90, "Latitude must be between -90 and 90");

const longitude = z
  .number({ invalid_type_error: "Enter a longitude like 76.6289" })
  .min(-180, "Longitude must be between -180 and 180")
  .max(180, "Longitude must be between -180 and 180");

export const storeSettingsSchema = z
  .object({
    lat: latitude.nullable(),
    lng: longitude.nullable(),
    maxRadiusKm: z
      .number({ invalid_type_error: "Enter the pickup radius in kilometres" })
      .positive("The pickup radius must be greater than 0")
      .max(100, "The pickup radius looks too large"),
    address: z.string().trim().max(300, "That address is too long").nullable(),
    whatsappNumber: z
      .string()
      .trim()
      .max(20, "That WhatsApp number is too long")
      .nullable(),
    gstin: z
      .string()
      .trim()
      .max(20, "A GSTIN is 15 characters")
      .nullable()
      .refine(
        (value) => !value || /^[0-9A-Z]{15}$/i.test(value),
        "A GSTIN is 15 characters, for example 29ABCDE1234F1Z5",
      ),
  })
  .refine((value) => (value.lat === null) === (value.lng === null), {
    message: "Set both the latitude and the longitude, or neither",
    path: ["lat"],
  });

export type StoreSettingsInput = z.input<typeof storeSettingsSchema>;
export type StoreSettingsValues = z.output<typeof storeSettingsSchema>;
