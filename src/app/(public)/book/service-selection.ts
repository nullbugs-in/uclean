import {
  pricingCategories,
  type CategorySlug,
  type PriceGroup,
  type PriceOption,
} from "@/data/pricing";

/**
 * The customer's chosen services, and the helpers the wizard shares between the
 * services step and the confirm step.
 *
 * A selection is keyed by "<group>/<item>/<option index>" rather than by price,
 * so switching between Regular and Express keeps what was chosen and only
 * re-prices it.
 */

export type SelectedService = {
  /** The same key as the map key, so the confirm step can re-price it. */
  key: string;
  group: string;
  item: string;
  /** "Dry Cleaning" and friends, when the line carries one. */
  option?: string;
  qty: number;
  unit: string;
  /** Price for the category currently being viewed. */
  unitPrice: number;
  original: number;
};

export type ServiceSelection = Record<string, number>;

export function selectionKey(
  groupSlug: string,
  itemSlug: string,
  optionIndex: number,
) {
  return `${groupSlug}/${itemSlug}/${optionIndex}`;
}

/** Flattens a category's groups into the selectable lines. */
export function linesForCategory(category: CategorySlug) {
  const source = pricingCategories.find((entry) => entry.slug === category);

  if (!source) return [];

  return source.groups.flatMap((group) =>
    group.items.flatMap((item) =>
      item.options.map((option, optionIndex) => ({
        key: selectionKey(group.slug, item.slug, optionIndex),
        group: group.name,
        groupSlug: group.slug,
        item: item.name,
        option: option.label,
        optionLabel: option.label ?? null,
        price: option.price,
        original: option.original,
        unit: option.unit,
      })),
    ),
  );
}

/**
 * Turns the stored selection into priced lines for whichever category is
 * active, so the same picks are shown against Express prices when the customer
 * switches over.
 */
export function resolveSelection(
  selection: ServiceSelection,
  category: CategorySlug,
): SelectedService[] {
  const lines = linesForCategory(category);

  return lines.flatMap((line) => {
    const qty = selection[line.key];
    if (!qty || qty < 1) return [];

    return [
      {
        key: line.key,
        group: line.group,
        item: line.item,
        option: line.optionLabel ?? undefined,
        qty,
        unit: line.unit,
        unitPrice: line.price,
        original: line.original,
      },
    ];
  });
}

export function selectionTotal(lines: SelectedService[]) {
  return lines.reduce((total, line) => total + line.unitPrice * line.qty, 0);
}

export function selectionCount(lines: SelectedService[]) {
  return lines.reduce((total, line) => total + line.qty, 0);
}

/** Groups in a category, used by the group selector. */
export function groupsForCategory(category: CategorySlug): PriceGroup[] {
  return (
    pricingCategories.find((entry) => entry.slug === category)?.groups ?? []
  );
}

/** Every priced line belonging to one group, in list order. */
export function linesForGroup(category: CategorySlug, groupSlug: string) {
  return linesForCategory(category).filter(
    (line) => line.groupSlug === groupSlug,
  );
}

/** The struck-through figure, or the price itself when there is no discount. */
export function displayOriginal(option: PriceOption) {
  return option.original > option.price ? option.original : null;
}
