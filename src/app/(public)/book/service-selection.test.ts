import { describe, expect, it } from "vitest";

import { deriveExpressCategory, type PriceCategory } from "@/lib/pricing";

import { itemsForGroup, resolveSelection } from "./service-selection";

/**
 * Guards the service list the wizard renders.
 *
 * The wizard shows one row per service, named exactly as the price list names
 * it, with no variant chips and no prices. The key behind each row has to be
 * the one `resolveSelection` and the booking action already understand, or a
 * service picked in the list would never reach the order.
 *
 * A fixture stands in for the assembled Regular list; the database now holds
 * the actual figures and `deriveExpressCategory` stands in for the express one.
 */

const regularFixture: PriceCategory = {
  slug: "regular",
  name: "Regular",
  tagline: "fixture",
  turnaround: "2 to 3 days",
  groups: [
    {
      slug: "adult-wear",
      name: "Adult Wear",
      items: [
        {
          slug: "shirt",
          name: "Shirt / Pant / T-shirt / Kurta",
          options: [
            { label: "Dry Cleaning", original: 119, price: 99, unit: "piece" },
            { label: "Steam Ironing", original: 24, price: 20, unit: "piece" },
          ],
        },
      ],
    },
    {
      slug: "shoe-cleaning",
      name: "Shoe Cleaning",
      turnaround: "3 days",
      items: [
        {
          slug: "slipper",
          name: "Slipper / Sandal",
          options: [{ original: 299, price: 249, unit: "pair" }],
        },
      ],
    },
    {
      slug: "household",
      name: "Household",
      items: [
        {
          slug: "bedsheet",
          name: "Bedsheet / Bed cover",
          options: [{ original: 159, price: 129, unit: "piece" }],
        },
        {
          slug: "blanket",
          name: "Blanket / Quilt",
          options: [{ original: 299, price: 249, unit: "piece" }],
        },
      ],
    },
  ],
};

const expressFixture = deriveExpressCategory(regularFixture);

describe("itemsForGroup", () => {
  it("returns one row per item, in list order", () => {
    const expected = (
      regularFixture.groups.find((group) => group.slug === "shoe-cleaning")
        ?.items ?? []
    ).map((item) => item.name);

    expect(
      itemsForGroup(regularFixture, "shoe-cleaning").map((row) => row.item),
    ).toEqual(expected);
  });

  it("books every item in every group", () => {
    // Nothing is dropped: an item with no variant choice is still bookable, so
    // the wear groups keep as many rows as the price list has items.
    for (const category of [regularFixture, expressFixture]) {
      for (const group of category.groups) {
        expect(itemsForGroup(category, group.slug)).toHaveLength(
          group.items.length,
        );
      }
    }
  });

  it("books a wear item by its dry cleaning line, never its ironing one", () => {
    // The Dry Cleaning / Steam Ironing choice is not offered in the wizard, so
    // only the first line on each wear item may be selectable. Selecting the
    // second would price and name a service the customer never asked for.
    const rows = itemsForGroup(regularFixture, "adult-wear");

    expect(rows[0]?.optionKey).toBe("adult-wear/shirt/0");

    // Sanity: the group really does carry a second line, so this is a choice
    // being withheld rather than there being nothing to withhold.
    expect(regularFixture.groups[0]?.items[0]?.options).toHaveLength(2);
  });

  it("never points at a line the group does not have", () => {
    for (const category of [regularFixture, expressFixture]) {
      for (const group of category.groups) {
        const priced = new Set(
          group.items.flatMap((item) =>
            item.options.map(
              (_, index) => `${group.slug}/${item.slug}/${index}`,
            ),
          ),
        );

        for (const item of itemsForGroup(category, group.slug)) {
          expect(priced.has(item.optionKey)).toBe(true);
        }
      }
    }
  });

  it("gives every row in a group a distinct key", () => {
    for (const category of [regularFixture, expressFixture]) {
      for (const group of category.groups) {
        const keys = itemsForGroup(category, group.slug).map(
          (item) => item.optionKey,
        );

        expect(new Set(keys).size).toBe(keys.length);
      }
    }
  });

  it("keys a service the same way in both categories, so a switch re-prices it", () => {
    // Express is the same list at a different price, so the two categories must
    // produce identical keys or switching would silently drop the selection.
    for (const group of regularFixture.groups) {
      expect(
        itemsForGroup(expressFixture, group.slug).map((item) => item.optionKey),
      ).toEqual(
        itemsForGroup(regularFixture, group.slug).map((item) => item.optionKey),
      );
    }
  });

  it("returns nothing for an unknown group", () => {
    expect(itemsForGroup(regularFixture, "no-such-group")).toEqual([]);
  });
});

describe("a picked service", () => {
  it("resolves into a priced line on the confirm step", () => {
    const item = itemsForGroup(regularFixture, "adult-wear")[0];
    if (!item) throw new Error("Expected a service in the wear group");

    const [line] = resolveSelection(regularFixture, { [item.optionKey]: 1 });

    expect(line?.item).toBe("Shirt / Pant / T-shirt / Kurta");
    // The variant is not shown on the row but still reaches the team, so the
    // booking line says which service was meant.
    expect(line?.option).toBe("Dry Cleaning");
    expect(line?.qty).toBe(1);
  });

  it("resolves a single-price item with no variant at all", () => {
    const item = itemsForGroup(regularFixture, "shoe-cleaning")[0];
    if (!item) throw new Error("Expected a service in the shoe group");

    const [line] = resolveSelection(regularFixture, { [item.optionKey]: 1 });

    expect(line?.item).toBe("Slipper / Sandal");
    expect(line?.option).toBeUndefined();
  });

  it("prices the same pick differently in each category", () => {
    const item = itemsForGroup(regularFixture, "shoe-cleaning")[0];
    if (!item) throw new Error("Expected a service in the shoe group");

    const regular = resolveSelection(regularFixture, { [item.optionKey]: 1 });
    const express = resolveSelection(expressFixture, { [item.optionKey]: 1 });

    expect(express[0]?.unitPrice).toBeGreaterThan(regular[0]?.unitPrice ?? 0);
  });

  it("yields one booked line per picked row", () => {
    const picks = Object.fromEntries(
      itemsForGroup(regularFixture, "household").map((item) => [
        item.optionKey,
        1,
      ]),
    );

    expect(resolveSelection(regularFixture, picks)).toHaveLength(
      itemsForGroup(regularFixture, "household").length,
    );
  });
});
