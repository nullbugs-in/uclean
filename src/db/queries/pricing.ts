import {
  deriveExpressCategory,
  type CategorySlug,
  type PriceCategory,
  type PriceGroup,
  type PriceItem,
  type PriceOption,
} from "@/lib/pricing";

import type {
  DbClient,
  PricingGroup,
  PricingItem,
  PricingOption,
} from "../types";

/**
 * The public price list, read from its tables.
 *
 * Regular is assembled straight from `pricing_groups`/`pricing_items`/
 * `pricing_options`; Express is derived from the assembled Regular list, so an
 * admin change is live everywhere the next time a request runs: `/pricing`, the
 * home overview, the /book wizard, the walk-in counter and the invoice's option
 * lookup all read through this file.
 *
 * `activeOnly` decides whether retired rows are hidden. Public pages go through
 * the default; the admin editor passes false because it has to be able to see
 * and restore a retired service. RLS also filters, but the query is the honest
 * statement of intent.
 */

type PricingReadOptions = {
  /** Hide items whose admin has marked inactive (and the groups under them). */
  activeOnly?: boolean;
};

export type PricingCatalog = {
  regular: PriceCategory;
  express: PriceCategory;
};

function unwrap<T>(result: {
  data: T[] | null;
  error: { message: string } | null;
}): T[] {
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? []) as T[];
}

export function buildCategoryData(
  groups: PricingGroup[],
  items: PricingItem[],
  options: PricingOption[],
  activeOnly: boolean,
): PriceCategory {
  // Items and options are bucketed by parent id, then walked in list order,
  // which is what both the price list and the admin editor display by.
  const itemsByGroup = new Map<string, PricingItem[]>();
  for (const item of items) {
    if (activeOnly && !item.is_active) continue;

    const bucket = itemsByGroup.get(item.group_id) ?? [];
    bucket.push(item);
    itemsByGroup.set(item.group_id, bucket);
  }

  const optionsByItem = new Map<string, PricingOption[]>();
  for (const option of options) {
    const bucket = optionsByItem.get(option.item_id) ?? [];
    bucket.push(option);
    optionsByItem.set(option.item_id, bucket);
  }

  const priceGroups: PriceGroup[] = [];

  for (const group of groups) {
    if (activeOnly && !group.is_active) continue;

    const groupItems: PriceItem[] = [];

    for (const item of itemsByGroup.get(group.id) ?? []) {
      // An item has to have at least one priced line to mean anything; one
      // without is invisible rather than a row a customer can tap into nothing.
      const itemOptions: PriceOption[] = (optionsByItem.get(item.id) ?? []).map(
        (option) => ({
          label: option.label ?? undefined,
          original: Number(option.original_price),
          price: Number(option.price),
          unit: option.unit,
          turnaround: option.turnaround ?? undefined,
        }),
      );

      if (itemOptions.length === 0 && activeOnly) continue;

      groupItems.push({
        slug: item.slug,
        name: item.name,
        image: item.image_url ?? undefined,
        options: itemOptions,
      });
    }

    // An empty group is still kept when inactive items are visible (the admin
    // editor needs the container to add into); hidden from the public list.
    if (groupItems.length === 0 && activeOnly) continue;

    priceGroups.push({
      slug: group.slug,
      name: group.name,
      turnaround: group.turnaround ?? undefined,
      items: groupItems,
    });
  }

  return {
    slug: "regular",
    name: "Regular",
    tagline:
      "Our standard service. Handled in the normal queue and returned within the listed turnaround.",
    turnaround: "2 to 3 days",
    groups: priceGroups,
  };
}

export function buildCatalog(
  regular: PriceCategory,
): { regular: PriceCategory; express: PriceCategory } {
  return { regular, express: deriveExpressCategory(regular) };
}

export function categoryFromCatalog(
  catalog: PricingCatalog,
  slug: CategorySlug,
): PriceCategory {
  return slug === "express" ? catalog.express : catalog.regular;
}

export async function readPricingRows(client: DbClient) {
  const groups = unwrap<PricingGroup>(
    await client
      .from("pricing_groups")
      .select("*")
      .order("sort_order", { ascending: true }),
  );

  const items = unwrap<PricingItem>(
    await client
      .from("pricing_items")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
  );

  const options = unwrap<PricingOption>(
    await client
      .from("pricing_options")
      .select("*")
      .order("sort_order", { ascending: true }),
  );

  return { groups, items, options };
}

/** The whole catalog for a public page or the admin editor. */
export async function readPricingCatalog(
  client: DbClient,
  options: PricingReadOptions = {},
): Promise<PricingCatalog> {
  const activeOnly = options.activeOnly ?? true;
  const { groups, items, options: optionRows } = await readPricingRows(client);

  const regular = buildCategoryData(groups, items, optionRows, activeOnly);

  return buildCatalog(regular);
}
