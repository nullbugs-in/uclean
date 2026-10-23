/**
 * The price list's shape and the Regular/Express relationship.
 *
 * The prices themselves live in the `pricing_groups` / `pricing_items` /
 `pricing_options` tables (migration 20260101000019 seeded them from the same
 * transcription of `laundry_price_list_updated.md` this module used to carry).
 * Everything here is pure: types every reader and admin screen share, and the
 * derivation that turns the stored Regular list into the Express one.
 */

export type CategorySlug = "regular" | "express";

/** One priced line on a card, e.g. "Dry Cleaning: ₹199, was ₹1119". */
export type PriceOption = {
  /**
   * What this price covers, e.g. "Dry Cleaning". Left undefined for groups with
   * a single price (Shoe Cleaning, Household) where the item name says enough.
   */
  label?: string;
  /** The struck-through figure printed in the list. */
  original: number;
  /** The current, discounted figure. Always <= original. */
  price: number;
  /** What the price applies per: "kg", "piece", "pair", "sq ft". */
  unit: string;
  /** Turnaround for this line, e.g. "2 to 3 days". */
  turnaround?: string;
};

export type PriceItem = {
  slug: string;
  name: string;
  /** Path under public/images/pricing. Undefined until artwork is supplied. */
  image?: string;
  options: PriceOption[];
};

export type PriceGroup = {
  slug: string;
  name: string;
  /** Group-wide turnaround, used where every item shares one. */
  turnaround?: string;
  items: PriceItem[];
};

export type PriceCategory = {
  slug: CategorySlug;
  name: string;
  tagline: string;
  /** Headline turnaround, shown on the category card. */
  turnaround: string;
  /**
   * True when the prices were computed from another category rather than
   * transcribed, so the UI can say so instead of implying they were listed.
   */
  derived?: boolean;
  /** How this category's prices were derived, shown when `derived`. */
  derivedFrom?: string;
  groups: PriceGroup[];
};

/**
 * The list states Express is a flat multiple of the regular price with a 5 hour
 * turnaround, so Express is derived rather than transcribed separately, in the
 * database or anywhere else. Changing this multiplier reprices the whole Express
 * list on the next read.
 *
 * ASSUMPTION: the multiple applies to the DISCOUNTED price, not the struck-
 * through original. Confirm before publishing if that is not the intent.
 */
export const EXPRESS_MULTIPLIER = 2;
export const EXPRESS_TURNAROUND = "5 hours";

export function deriveExpressCategory(source: PriceCategory): PriceCategory {
  return {
    slug: "express",
    name: "Express",
    tagline: `Priority handling at ${EXPRESS_MULTIPLIER}x the regular price, ready in about ${EXPRESS_TURNAROUND}.`,
    turnaround: EXPRESS_TURNAROUND,
    derived: true,
    derivedFrom: `${EXPRESS_MULTIPLIER}x the Regular price list`,
    groups: source.groups.map((group) => ({
      ...group,
      // The 3 day group default does not apply to a 5 hour service.
      turnaround: undefined,
      items: group.items.map((item) => ({
        ...item,
        options: item.options.map((option) => ({
          ...option,
          original: option.original * EXPRESS_MULTIPLIER,
          price: option.price * EXPRESS_MULTIPLIER,
          turnaround: EXPRESS_TURNAROUND,
        })),
      })),
    })),
  };
}

/**
 * Both categories, Regular and its Express derivation, in page order.
 *
 * Takes the Regular list from wherever it was read (the database in
 * production, a fixture in tests) so no module here reaches round a globe for
 * global state.
 */
export function pricingCategories(regular: PriceCategory): PriceCategory[] {
  return [regular, deriveExpressCategory(regular)];
}

/** Look up a category by slug. Returns undefined for an unknown slug. */
export function getPricingCategory(
  regular: PriceCategory,
  slug: string,
): PriceCategory | undefined {
  return pricingCategories(regular).find((category) => category.slug === slug);
}

/** Total number of priced items across every group. */
export function itemCount(category: PriceCategory): number {
  return category.groups.reduce(
    (total, group) => total + group.items.length,
    0,
  );
}

/** Total number of individual price lines, counting each option separately. */
export function optionCount(category: PriceCategory): number {
  return category.groups.reduce(
    (total, group) =>
      total +
      group.items.reduce(
        (itemTotal, item) => itemTotal + item.options.length,
        0,
      ),
    0,
  );
}

/**
 * Cheapest single price in the category, used for the "from" figure on the
 * category card.
 */
export function cheapestPrice(category: PriceCategory): {
  price: number;
  unit: string;
} {
  let cheapest: PriceOption | undefined;

  for (const group of category.groups) {
    for (const item of group.items) {
      for (const option of item.options) {
        if (!cheapest || option.price < cheapest.price) cheapest = option;
      }
    }
  }

  // Every category is authored with at least one option; the guard keeps the
  // return type honest if that ever stops being true.
  if (!cheapest) throw new Error(`Category "${category.slug}" has no prices`);

  return { price: cheapest.price, unit: cheapest.unit };
}
