import { EXPRESS_MULTIPLIER, type CategorySlug, type PriceCategory } from "@/lib/pricing";

/**
 * The public price list flattened into dropdown options, plus the helper that
 * works out which of the two lists a booking was priced against.
 *
 * Shared by the booking invoice form, which must show the same categories,
 * names and figures the customer saw on /pricing — and by nothing else, so the
 * invoice channel cannot quietly drift from the price list the wizard books
 * from.
 *
 * Everything here is a pure function of the `PriceCategory` handed in: the
 * regular list is read from the database now, so the caller (the server page
 * that loads it) provides it rather than this module reaching for global data.
 */

export type PricingCatalogPair = {
  regular: PriceCategory;
  express: PriceCategory;
};

export type PricedOption = {
  key: string;
  /** What the Select shows: item and option apart. */
  display: string;
  /** What is stored on the line, worded exactly as a booking writes it. */
  name: string;
  price: number;
  unit: string;
};

/** One subcategory's options, for the grouped dropdown. */
export type PricedSection = {
  slug: string;
  name: string;
  options: PricedOption[];
};

/** The category of a speed, from the pair a page read for this request. */
export function categoryForSpeed(
  catalog: PricingCatalogPair,
  category: CategorySlug,
): PriceCategory {
  return category === "express" ? catalog.express : catalog.regular;
}

/**
 * The priced options of one category, grouped by subcategory.
 *
 * A wear item prices differently per option (dry cleaning vs steam ironing), and
 * the price list is the record of both, so every priced option is an option the
 * admin can put on the bill — not only the dry-cleaning choice the Book Now
 * wizard preselects.
 */
export function catalogueSections(
  category: PriceCategory,
): PricedSection[] {
  return category.groups.map((group) => ({
    slug: group.slug,
    name: group.name,
    options: group.items.flatMap((item) =>
      item.options.map((option, index) => ({
        key: `${category.slug}/${group.slug}/${item.slug}/${index}`,
        display: option.label ? `${item.name} — ${option.label}` : item.name,
        name: option.label ? `${item.name} (${option.label})` : item.name,
        price: option.price,
        unit: option.unit,
      })),
    ),
  }));
}

/** The price-list option whose stored name equals the line, if there is one. */
export function findOptionByName(
  catalog: PricingCatalogPair,
  name: string,
  category: CategorySlug,
): PricedOption | null {
  for (const section of catalogueSections(categoryForSpeed(catalog, category))) {
    for (const option of section.options) {
      if (option.name === name) return option;
    }
  }

  return null;
}

/** The six subcategories of one speed, for the invoice form's category picker. */
export function catalogueGroups(category: PriceCategory): Array<{
  slug: string;
  name: string;
}> {
  return category.groups.map((group) => ({
    slug: group.slug,
    name: group.name,
  }));
}

/**
 * Money is compared with a small tolerance rather than `===`: quantities and
 * prices travel through JSON and a PostgREST numeric, so 2 × 107.5 can arrive
 * as 214.9999999 without ever having been traded.
 */
function sameAmount(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005;
}

/**
 * Which price list a booking was priced against.
 *
 * No Express/Regular flag is stored on a booking — its lines carry only the
 * figure they were quoted — so the speed is inferred by matching each booked
 * line against the regular price list: a name that matches a Regular option at
 * the Regular price votes Regular, at `EXPRESS_MULTIPLIER` times it votes
 * Express, and everything else (edited prices, lines whose service has since
 * been renamed or removed) is a non-vote.
 *
 * Majority decides, so a mixed booking still resolves rather than showing one
 * list while another explains a different total; ties and no-vote bookings fall
 * back to Regular, whose figures are editable per line in the invoice form
 * either way.
 */
export function detectBookingSpeed(
  catalog: PricingCatalogPair,
  lines: ReadonlyArray<{ name: string; unitPrice: number }>,
): CategorySlug {
  let regular = 0;
  let express = 0;

  for (const line of lines) {
    const option = findOptionByName(catalog, line.name, "regular");
    if (!option) continue;

    if (sameAmount(line.unitPrice, option.price)) regular += 1;
    else if (sameAmount(line.unitPrice, option.price * EXPRESS_MULTIPLIER))
      express += 1;
  }

  return express > regular ? "express" : "regular";
}

/**
 * The group a booked line's matching option sits in, so the invoice form's
 * category picker can open on the services the customer actually booked.
 */
export function groupForOption(
  optionKey: string,
): string | null {
  // Key shape: "<category>/<group slug>/<item slug>/<option index>".
  const groupSlug = optionKey.split("/")[1];
  return groupSlug ?? null;
}

/**
 * The default category for a booking: the group holding the first booked line
 * that matches the price list, falling back to the list's own first group.
 */
export function defaultGroupForBooking(
  catalog: PricingCatalogPair,
  lines: ReadonlyArray<{ name: string; unitPrice: number }>,
  speed: CategorySlug,
): PricedSection["slug"] {
  for (const line of lines) {
    const groupSlug = groupForOptionKey(catalog, line.name, speed);
    if (groupSlug) return groupSlug;
  }

  return catalogueSections(categoryForSpeed(catalog, speed))[0]?.slug ?? "";
}

/** Matches a booked name to a price-list option and returns its group. */
function groupForOptionKey(
  catalog: PricingCatalogPair,
  bookedName: string,
  speed: CategorySlug,
): string | null {
  const option = findOptionByName(catalog, bookedName, speed);
  return option ? groupForOption(option.key) : null;
}
