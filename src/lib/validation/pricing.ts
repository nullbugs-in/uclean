import { z } from "zod";

/**
 * Price-catalogue schemas, for the admin Services & Pricing forms.
 *
 * Every rule exists because it keeps a bad figure out of what every customer
 * page quotes from: /pricing, the wizard, the walk-in counter and the invoice
 * lookup all read the same rows, so a "-5 price" or an unnamed item here would
 * be visible at once everywhere. A price of 0 is deliberately valid — a free
 * or promotional line — while a negative or non-numeric one is not.
 *
 * Separated from the actions that consume these so the rules can be tested
 * without loading `next/cache` and the auth stack, the same split the other
 * schemas use.
 */

const name = z
  .string()
  .trim()
  .min(1, "Give it a name")
  .max(120, "That name is too long");

const money = z.coerce
  .number({ invalid_type_error: "Enter an amount, 0 for a free line" })
  .min(0, "Amount cannot be negative")
  .max(100000, "That amount looks too high");

const sortOrder = z.coerce
  .number({ invalid_type_error: "Sort order must be a number" })
  .int("Sort order must be a whole number")
  .min(0, "Sort order cannot be negative")
  .max(9999, "That sort order looks too high");

const isActive = z.boolean();

/** One subcategory (Laundry Services, Adult Wear, …). */
export const pricingGroupSchema = z.object({
  id: z.string().uuid(),
  name,
  /** The line under a group name on /pricing; empty means no line is shown. */
  turnaround: z
    .string()
    .trim()
    .max(60, "That turnaround is too long")
    .nullable(),
  isActive,
  sortOrder,
});

export type PricingGroupInput = z.input<typeof pricingGroupSchema>;
export type PricingGroupValues = z.output<typeof pricingGroupSchema>;

/** One service inside a subcategory (Shirt / Pant / T-shirt / Kurta, …). */
export const pricingItemSchema = z.object({
  id: z.string().uuid(),
  groupId: z.string().uuid(),
  name,
  imageUrl: z.string().trim().max(500, "That image path is too long").nullable(),
  isActive,
  sortOrder,
});

export type PricingItemInput = z.input<typeof pricingItemSchema>;
export type PricingItemValues = z.output<typeof pricingItemSchema>;

/**
 * One priced line on an item, which is what is actually quoted.
 *
 * The original price is the struck-through figure; when it is not higher than
 * the display price there is no discount to strike, and both figures simply
 * agree. The optional label ("Dry Cleaning") is what makes one item able to
 * carry two prices.
 */
const pricingOptionShape = z.object({
  id: z.string().uuid().optional(),
  itemId: z.string().uuid(),
  label: z.string().trim().max(60, "That label is too long").nullable(),
  originalPrice: money,
  price: money,
  unit: z
    .string()
    .trim()
    .min(1, "Give the unit, e.g. kg, piece or pair")
    .max(20, "That unit is too long"),
  turnaround: z
    .string()
    .trim()
    .max(60, "That turnaround is too long")
    .nullable(),
  sortOrder,
});

const discountRefinement = (option: {
  originalPrice: number;
  price: number;
}): boolean => option.originalPrice >= option.price;

const discountMessage = {
  message: "The original price should match or exceed the display price",
  path: ["originalPrice"],
};

export const pricingOptionSchema = pricingOptionShape.refine(
  discountRefinement,
  discountMessage,
);

export type PricingOptionInput = z.input<typeof pricingOptionSchema>;
export type PricingOptionValues = z.output<typeof pricingOptionSchema>;

/**
 * The create shapes. A new row has no id of its own yet and belongs wholly to
 * its parent, so both drop what the database mints.
 */
export const pricingGroupCreateSchema = pricingGroupSchema.omit({ id: true });
export const pricingItemCreateSchema = pricingItemSchema.omit({ id: true });
export const pricingOptionCreateSchema = pricingOptionShape
  .omit({ id: true })
  .refine(discountRefinement, discountMessage);
/** An update names the row it edits, so the id is required. */
export const pricingOptionUpdateSchema = pricingOptionShape
  .omit({ id: true })
  .extend({ id: z.string().uuid() })
  .refine(discountRefinement, discountMessage);

export type PricingGroupCreateInput = z.input<typeof pricingGroupCreateSchema>;
export type PricingItemCreateInput = z.input<typeof pricingItemCreateSchema>;
export type PricingOptionCreateInput = z.input<
  typeof pricingOptionCreateSchema
>;
export type PricingOptionUpdateInput = z.input<typeof pricingOptionUpdateSchema>;
