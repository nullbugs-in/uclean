import type {
  PriceCategory,
  PriceGroup,
  PriceOption,
} from "@/lib/pricing";

/**
 * The customer's chosen services, and the helpers the wizard shares between the
 * services step and the confirm step.
 *
 * A selection is keyed by "<group>/<item>/<option index>" rather than by price,
 * so switching between Regular and Express keeps what was chosen and only
 * re-prices it. Every function takes the `PriceCategory` being browsed rather
 * than importing global data — the regular list comes from the database now
 * (see `src/db/queries/pricing.ts`), and Express is a derivation of it.
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
export function linesForCategory(category: PriceCategory) {
  return category.groups.flatMap((group) =>
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
 * One selectable service: the name the customer reads, and the single priced
 * line sitting behind it.
 *
 * The wizard books by name. Every group resolves to one line per item - most
 * items are priced once, and Adult Wear and Kids Wear are booked without the
 * Dry Cleaning / Steam Ironing choice the price list offers - so an item and
 * its line are one thing here rather than a name with options hanging off it.
 * The full two-price list is unchanged on `/pricing`, where the variant is the
 * point of the page.
 */
export type SelectableItem = {
  /** Item slug, stable within its group. */
  key: string;
  item: string;
  /**
   * The `selectionKey` of the priced line this item books as, so picking it
   * here is the same act as picking that line in `resolveSelection`.
   */
  optionKey: string;
};

/**
 * Turns the stored selection into priced lines for whichever category is
 * active, so the same picks are shown against Express prices when the customer
 * switches over.
 */
export function resolveSelection(
  category: PriceCategory,
  selection: ServiceSelection,
): SelectedService[] {
  return linesForCategory(category).flatMap((line) => {
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
export function groupsForCategory(
  category: PriceCategory,
): PriceGroup[] {
  return category.groups;
}

/**
 * Every selectable service belonging to one group, in list order.
 *
 * The item name is shown once, exactly as the price list shows it, and the
 * priced line behind it is reached by key rather than by anything the customer
 * sees.
 */
export function itemsForGroup(
  category: PriceCategory,
  groupSlug: string,
): SelectableItem[] {
  const group = category.groups.find((entry) => entry.slug === groupSlug);

  if (!group) return [];

  return group.items.flatMap((item) => {
    // Every item in the list is authored with a price. An item without one has
    // nothing to book against, so it is dropped rather than shown unpickable.
    if (!item.options[0]) return [];

    return [
      {
        key: item.slug,
        item: item.name,
        optionKey: selectionKey(group.slug, item.slug, 0),
      },
    ];
  });
}

/** The struck-through figure, or the price itself when there is no discount. */
export function displayOriginal(option: PriceOption) {
  return option.original > option.price ? option.original : null;
}
