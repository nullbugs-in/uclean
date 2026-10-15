/**
 * Public price list.
 *
 * Transcribed from `laundry_price_list_updated.md` at the repository root, which
 * stays the source of truth. Pure data on purpose: no icons or components here,
 * so the ~47 rows can be reviewed and diffed on their own and unit tested
 * without pulling in React.
 *
 * Item slugs are unique only WITHIN their group, so identify an item as
 * "<group slug>/<item slug>" (see pricing.test.ts). When artwork arrives, drop
 * it in `public/images/pricing/` and set that item's `image`.
 */

export type CategorySlug = "regular" | "express";

/** One priced line on a card, e.g. "Dry Cleaning: ₹99, was ₹119". */
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

/* -- Laundry services ----------------------------------------------------- */

const laundryServices: PriceGroup = {
  slug: "laundry-services",
  name: "Laundry Services",
  items: [
    {
      slug: "wash-and-fold",
      name: "Wash & Fold",
      options: [
        {
          original: 107,
          price: 89,
          unit: "kg",
          turnaround: "24 to 48 hours",
        },
      ],
    },
    {
      slug: "wash-and-iron",
      name: "Wash & Iron",
      options: [
        {
          original: 155,
          price: 129,
          unit: "kg",
          turnaround: "2 to 3 days",
        },
      ],
    },
    {
      slug: "premium-laundry",
      name: "Premium Laundry",
      options: [
        {
          original: 239,
          price: 199,
          unit: "kg",
          turnaround: "2 to 3 days",
        },
      ],
    },
  ],
};

/* -- Adult wear ----------------------------------------------------------- */

/**
 * Adult wear carries two prices per item, so every item repeats the pair.
 * Written out per item rather than generated, to keep each printed line
 * auditable against the source list.
 */
const adultWear: PriceGroup = {
  slug: "adult-wear",
  name: "Adult Wear",
  items: [
    {
      slug: "shirt-pant-tee-kurta",
      name: "Shirt / Pant / T-shirt / Kurta",
      options: [
        {
          label: "Dry Cleaning",
          original: 119,
          price: 99,
          unit: "piece",
          turnaround: "3 days",
        },
        {
          label: "Steam Ironing",
          original: 24,
          price: 20,
          unit: "piece",
          turnaround: "2 days",
        },
      ],
    },
    {
      slug: "dhoti-long-top",
      name: "Dhoti / Long top",
      options: [
        {
          label: "Dry Cleaning",
          original: 179,
          price: 149,
          unit: "piece",
          turnaround: "3 days",
        },
        {
          label: "Steam Ironing",
          original: 35,
          price: 29,
          unit: "piece",
          turnaround: "2 days",
        },
      ],
    },
    {
      slug: "kurta-designer-stone",
      name: "Kurta (Designer / Stone work)",
      options: [
        {
          label: "Dry Cleaning",
          original: 179,
          price: 149,
          unit: "piece",
          turnaround: "3 days",
        },
        {
          label: "Steam Ironing",
          original: 83,
          price: 69,
          unit: "piece",
          turnaround: "2 days",
        },
      ],
    },
    {
      slug: "shorts",
      name: "Shorts",
      options: [
        {
          label: "Dry Cleaning",
          original: 71,
          price: 59,
          unit: "piece",
          turnaround: "3 days",
        },
        {
          label: "Steam Ironing",
          original: 18,
          price: 15,
          unit: "piece",
          turnaround: "2 days",
        },
      ],
    },
    {
      slug: "blazer",
      name: "Blazer",
      options: [
        {
          label: "Dry Cleaning",
          original: 299,
          price: 249,
          unit: "piece",
          turnaround: "3 days",
        },
        {
          label: "Steam Ironing",
          original: 83,
          price: 69,
          unit: "piece",
          turnaround: "2 days",
        },
      ],
    },
    {
      slug: "waistcoat-half-jacket",
      name: "Waistcoat / Half Jacket",
      options: [
        {
          label: "Dry Cleaning",
          original: 119,
          price: 99,
          unit: "piece",
          turnaround: "3 days",
        },
        {
          label: "Steam Ironing",
          original: 24,
          price: 20,
          unit: "piece",
          turnaround: "2 days",
        },
      ],
    },
    {
      slug: "sweater-cardigan",
      name: "Sweater / Cardigan",
      options: [
        {
          label: "Dry Cleaning",
          original: 179,
          price: 149,
          unit: "piece",
          turnaround: "3 days",
        },
        {
          label: "Steam Ironing",
          original: 59,
          price: 49,
          unit: "piece",
          turnaround: "2 days",
        },
      ],
    },
    {
      slug: "sharwani-plain",
      name: "Sharwani Plain",
      options: [
        {
          label: "Dry Cleaning",
          original: 299,
          price: 249,
          unit: "piece",
          turnaround: "3 days",
        },
        {
          label: "Steam Ironing",
          original: 107,
          price: 89,
          unit: "piece",
          turnaround: "2 days",
        },
      ],
    },
    {
      slug: "sharwani",
      name: "Sharwani",
      options: [
        {
          label: "Dry Cleaning",
          original: 419,
          price: 349,
          unit: "piece",
          turnaround: "3 days",
        },
        {
          label: "Steam Ironing",
          original: 143,
          price: 119,
          unit: "piece",
          turnaround: "2 days",
        },
      ],
    },
    {
      slug: "jacket",
      name: "Jacket",
      options: [
        {
          label: "Dry Cleaning",
          original: 239,
          price: 199,
          unit: "piece",
          turnaround: "3 days",
        },
        {
          label: "Steam Ironing",
          original: 71,
          price: 59,
          unit: "piece",
          turnaround: "2 days",
        },
      ],
    },
    {
      slug: "churidar-set",
      name: "Churidar Set (3 Pcs)",
      options: [
        {
          label: "Dry Cleaning",
          original: 359,
          price: 299,
          unit: "piece",
          turnaround: "3 days",
        },
        {
          label: "Steam Ironing",
          original: 95,
          price: 79,
          unit: "piece",
          turnaround: "2 days",
        },
      ],
    },
    {
      slug: "dupatta-scarf-muffler",
      name: "Dupatta / Scarf / Muffler",
      options: [
        {
          label: "Dry Cleaning",
          original: 95,
          price: 79,
          unit: "piece",
          turnaround: "3 days",
        },
        {
          label: "Steam Ironing",
          original: 24,
          price: 20,
          unit: "piece",
          turnaround: "2 days",
        },
      ],
    },
    {
      slug: "saree-light",
      name: "Saree Light",
      options: [
        {
          label: "Dry Cleaning",
          original: 299,
          price: 249,
          unit: "piece",
          turnaround: "3 days",
        },
        {
          label: "Steam Ironing",
          original: 95,
          price: 79,
          unit: "piece",
          turnaround: "2 days",
        },
      ],
    },
    {
      slug: "saree-medium",
      name: "Saree Medium",
      options: [
        {
          label: "Dry Cleaning",
          original: 359,
          price: 299,
          unit: "piece",
          turnaround: "3 days",
        },
        {
          label: "Steam Ironing",
          original: 107,
          price: 89,
          unit: "piece",
          turnaround: "2 days",
        },
      ],
    },
    {
      slug: "saree-heavy",
      name: "Saree Heavy",
      options: [
        {
          label: "Dry Cleaning",
          original: 419,
          price: 349,
          unit: "piece",
          turnaround: "3 days",
        },
        {
          label: "Steam Ironing",
          original: 131,
          price: 109,
          unit: "piece",
          turnaround: "2 days",
        },
      ],
    },
    {
      slug: "blouse",
      name: "Blouse",
      options: [
        {
          label: "Dry Cleaning",
          original: 59,
          price: 49,
          unit: "piece",
          turnaround: "3 days",
        },
        {
          label: "Steam Ironing",
          original: 24,
          price: 20,
          unit: "piece",
          turnaround: "2 days",
        },
      ],
    },
    {
      slug: "petticoat",
      name: "Petticoat",
      options: [
        {
          label: "Dry Cleaning",
          original: 95,
          price: 79,
          unit: "piece",
          turnaround: "3 days",
        },
        {
          label: "Steam Ironing",
          original: 24,
          price: 20,
          unit: "piece",
          turnaround: "2 days",
        },
      ],
    },
    {
      slug: "choli-plain",
      name: "Choli Plain",
      options: [
        {
          label: "Dry Cleaning",
          original: 107,
          price: 89,
          unit: "piece",
          turnaround: "3 days",
        },
        {
          label: "Steam Ironing",
          original: 35,
          price: 29,
          unit: "piece",
          turnaround: "2 days",
        },
      ],
    },
    {
      slug: "lehenga-plain",
      name: "Lehenga Plain",
      options: [
        {
          label: "Dry Cleaning",
          original: 239,
          price: 199,
          unit: "piece",
          turnaround: "3 days",
        },
        {
          label: "Steam Ironing",
          original: 107,
          price: 89,
          unit: "piece",
          turnaround: "2 days",
        },
      ],
    },
    {
      slug: "choli-beaded",
      name: "Choli Beaded",
      options: [
        {
          label: "Dry Cleaning",
          original: 155,
          price: 129,
          unit: "piece",
          turnaround: "3 days",
        },
        {
          label: "Steam Ironing",
          original: 59,
          price: 49,
          unit: "piece",
          turnaround: "2 days",
        },
      ],
    },
    {
      slug: "lehenga-beaded",
      name: "Lehenga Beaded",
      options: [
        {
          label: "Dry Cleaning",
          original: 359,
          price: 299,
          unit: "piece",
          turnaround: "3 days",
        },
        {
          label: "Steam Ironing",
          original: 155,
          price: 129,
          unit: "piece",
          turnaround: "2 days",
        },
      ],
    },
    {
      slug: "choli-bridal",
      name: "Choli Bridal",
      options: [
        {
          label: "Dry Cleaning",
          original: 179,
          price: 149,
          unit: "piece",
          turnaround: "3 days",
        },
        {
          label: "Steam Ironing",
          original: 107,
          price: 89,
          unit: "piece",
          turnaround: "2 days",
        },
      ],
    },
    {
      slug: "lehenga-bridal",
      name: "Lehenga Bridal",
      options: [
        {
          label: "Dry Cleaning",
          original: 479,
          price: 399,
          unit: "piece",
          turnaround: "3 days",
        },
        {
          label: "Steam Ironing",
          original: 179,
          price: 149,
          unit: "piece",
          turnaround: "2 days",
        },
      ],
    },
  ],
};

/* -- Kids wear ------------------------------------------------------------ */

const kidsWear: PriceGroup = {
  slug: "kids-wear",
  name: "Kids Wear",
  items: [
    {
      slug: "shirt-tee-pant-kurta",
      name: "Shirt / T-shirt / Pant / Kurta",
      options: [
        {
          label: "Dry Cleaning",
          original: 95,
          price: 79,
          unit: "piece",
          turnaround: "3 days",
        },
        {
          label: "Steam Ironing",
          original: 18,
          price: 15,
          unit: "piece",
          turnaround: "2 days",
        },
      ],
    },
    {
      slug: "kurta-designer-frock",
      name: "Kurta Designer / Frock",
      options: [
        {
          label: "Dry Cleaning",
          original: 155,
          price: 129,
          unit: "piece",
          turnaround: "3 days",
        },
        {
          label: "Steam Ironing",
          original: 47,
          price: 39,
          unit: "piece",
          turnaround: "2 days",
        },
      ],
    },
    {
      slug: "short-skirt-shorts",
      name: "Short Skirt / Shorts",
      options: [
        {
          label: "Dry Cleaning",
          original: 59,
          price: 49,
          unit: "piece",
          turnaround: "3 days",
        },
        {
          label: "Steam Ironing",
          original: 18,
          price: 15,
          unit: "piece",
          turnaround: "2 days",
        },
      ],
    },
    {
      slug: "choli-plain",
      name: "Choli Plain",
      options: [
        {
          label: "Dry Cleaning",
          original: 95,
          price: 79,
          unit: "piece",
          turnaround: "3 days",
        },
        {
          label: "Steam Ironing",
          original: 18,
          price: 15,
          unit: "piece",
          turnaround: "2 days",
        },
      ],
    },
    {
      slug: "lehenga-plain",
      name: "Lehenga Plain",
      options: [
        {
          label: "Dry Cleaning",
          original: 239,
          price: 199,
          unit: "piece",
          turnaround: "3 days",
        },
        {
          label: "Steam Ironing",
          original: 59,
          price: 49,
          unit: "piece",
          turnaround: "2 days",
        },
      ],
    },
    {
      slug: "choli-stone-work",
      name: "Choli Stone Work",
      options: [
        {
          label: "Dry Cleaning",
          original: 155,
          price: 129,
          unit: "piece",
          turnaround: "3 days",
        },
        {
          label: "Steam Ironing",
          original: 47,
          price: 39,
          unit: "piece",
          turnaround: "2 days",
        },
      ],
    },
    {
      slug: "lehenga-stone-work",
      name: "Lehenga Stone Work",
      options: [
        {
          label: "Dry Cleaning",
          original: 359,
          price: 299,
          unit: "piece",
          turnaround: "3 days",
        },
        {
          label: "Steam Ironing",
          original: 107,
          price: 89,
          unit: "piece",
          turnaround: "2 days",
        },
      ],
    },
    {
      slug: "dupatta",
      name: "Dupatta",
      options: [
        {
          label: "Dry Cleaning",
          original: 59,
          price: 49,
          unit: "piece",
          turnaround: "3 days",
        },
        {
          label: "Steam Ironing",
          original: 18,
          price: 15,
          unit: "piece",
          turnaround: "2 days",
        },
      ],
    },
    {
      slug: "blazer-coat",
      name: "Blazer / Coat",
      options: [
        {
          label: "Dry Cleaning",
          original: 215,
          price: 179,
          unit: "piece",
          turnaround: "3 days",
        },
        {
          label: "Steam Ironing",
          original: 71,
          price: 59,
          unit: "piece",
          turnaround: "2 days",
        },
      ],
    },
    {
      slug: "waist-coat-half-jacket",
      name: "Waist Coat / Half Jacket",
      options: [
        {
          label: "Dry Cleaning",
          original: 95,
          price: 79,
          unit: "piece",
          turnaround: "3 days",
        },
        {
          label: "Steam Ironing",
          original: 18,
          price: 15,
          unit: "piece",
          turnaround: "2 days",
        },
      ],
    },
    {
      slug: "jacket",
      name: "Jacket",
      options: [
        {
          label: "Dry Cleaning",
          original: 155,
          price: 129,
          unit: "piece",
          turnaround: "3 days",
        },
        {
          label: "Steam Ironing",
          original: 47,
          price: 39,
          unit: "piece",
          turnaround: "2 days",
        },
      ],
    },
  ],
};

/* -- Shoe cleaning -------------------------------------------------------- */

const shoeCleaning: PriceGroup = {
  slug: "shoe-cleaning",
  name: "Shoe Cleaning",
  turnaround: "3 days",
  items: [
    {
      slug: "slipper-sandal",
      name: "Slipper / Sandal",
      options: [{ original: 179, price: 149, unit: "pair" }],
    },
    {
      slug: "clogs",
      name: "Clogs",
      options: [{ original: 239, price: 199, unit: "pair" }],
    },
    {
      slug: "sports-shoe-sneaker",
      name: "Sports Shoe / Sneaker",
      options: [{ original: 299, price: 249, unit: "pair" }],
    },
    {
      slug: "boots-leather-shoe",
      name: "Boots / Leather Shoe",
      options: [{ original: 359, price: 299, unit: "pair" }],
    },
  ],
};

/* -- Household ------------------------------------------------------------ */

const household: PriceGroup = {
  slug: "household",
  name: "Household",
  turnaround: "3 days",
  items: [
    {
      slug: "blanket-quilt-single",
      name: "Blanket / Quilt - Single",
      options: [{ original: 299, price: 249, unit: "piece" }],
    },
    {
      slug: "blanket-quilt-double",
      name: "Blanket / Quilt - Double",
      options: [{ original: 479, price: 399, unit: "piece" }],
    },
    {
      slug: "blanket-quilt-king",
      name: "Blanket / Quilt - King Size",
      options: [{ original: 599, price: 499, unit: "piece" }],
    },
    {
      slug: "pillow",
      name: "Pillow",
      options: [{ original: 143, price: 119, unit: "piece" }],
    },
    {
      slug: "bathmat-foot-mat",
      name: "Bathmat / Foot Mat",
      options: [{ original: 83, price: 69, unit: "piece" }],
    },
    {
      // Per square foot, unlike every other household line.
      slug: "carpet-cleaning",
      name: "Carpet Cleaning",
      options: [{ original: 48, price: 40, unit: "sq ft" }],
    },
  ],
};

/* -- Curtain cleaning ----------------------------------------------------- */

/**
 * Curtains are priced by size band rather than per piece, so each band is its
 * own item with a single price, the way Household lists its sizes.
 */
const curtainCleaning: PriceGroup = {
  slug: "curtain-cleaning",
  name: "Curtain Cleaning",
  turnaround: "3 days",
  items: [
    {
      slug: "curtain-0-4-feet",
      name: "0 to 4 Feet",
      options: [{ original: 359, price: 299, unit: "piece" }],
    },
    {
      slug: "curtain-4-8-feet",
      name: "4 to 8 Feet",
      options: [{ original: 539, price: 449, unit: "piece" }],
    },
    {
      slug: "curtain-8-12-feet",
      name: "8 to 12 Feet",
      options: [{ original: 719, price: 599, unit: "piece" }],
    },
    {
      slug: "curtain-above-12-feet",
      name: "More than 12 Feet",
      options: [{ original: 959, price: 799, unit: "piece" }],
    },
  ],
};

/* -- Categories ----------------------------------------------------------- */

const regularCategory: PriceCategory = {
  slug: "regular",
  name: "Regular",
  tagline:
    "Our standard service. Handled in the normal queue and returned within the listed turnaround.",
  turnaround: "2 to 3 days",
  groups: [
    laundryServices,
    adultWear,
    kidsWear,
    shoeCleaning,
    household,
    curtainCleaning,
  ],
};

/**
 * The list states Express is a flat multiple of the regular price with a 5 hour
 * turnaround, so Express is derived rather than transcribed separately.
 *
 * ASSUMPTION: the multiple applies to the DISCOUNTED price, not the struck-
 * through original. Confirm before publishing if that is not the intent.
 */
export const EXPRESS_MULTIPLIER = 2;
export const EXPRESS_TURNAROUND = "5 hours";

function deriveExpressCategory(source: PriceCategory): PriceCategory {
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

/** Exported for tests; the page itself should read `pricingCategories`. */
export const expressCategory = deriveExpressCategory(regularCategory);

/** Exported for tests. */
export const regularPriceList = regularCategory;

/** Both categories, in the order they appear on the pricing page. */
export const pricingCategories: PriceCategory[] = [
  regularCategory,
  expressCategory,
];

/** Look up a category by slug. Returns undefined for an unknown slug. */
export function getPricingCategory(slug: string): PriceCategory | undefined {
  return pricingCategories.find((category) => category.slug === slug);
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
