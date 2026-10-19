import { describe, expect, it } from "vitest";

import { getPricingCategory, pricingCategories } from "@/data/pricing";
import type { CategorySlug } from "@/data/pricing";

import { itemsForGroup, resolveSelection } from "./service-selection";

/**
 * Guards the service list the wizard renders.
 *
 * The wizard shows one row per service, named exactly as the price list names
 * it, with no variant chips and no prices. The key behind each row has to be
 * the one `resolveSelection` and the booking action already understand, or a
 * service picked in the list would never reach the order.
 */

describe("itemsForGroup", () => {
  it("returns one row per item, in list order", () => {
    const expected = getPricingCategory("regular")
      ?.groups.find((group) => group.slug === "shoe-cleaning")
      ?.items.map((item) => item.name);

    expect(
      itemsForGroup("regular", "shoe-cleaning").map((i) => i.item),
    ).toEqual(expected);
  });

  it("books every item in every group", () => {
    // Nothing is dropped: an item with no variant choice is still bookable, so
    // the wear groups keep as many rows as the price list has items.
    for (const category of pricingCategories) {
      for (const group of category.groups) {
        expect(itemsForGroup(category.slug, group.slug)).toHaveLength(
          group.items.length,
        );
      }
    }
  });

  it("books a wear item by its dry cleaning line, never its ironing one", () => {
    // The Dry Cleaning / Steam Ironing choice is not offered in the wizard, so
    // only the first line on each wear item may be selectable. Selecting the
    // second would price and name a service the customer never asked for.
    for (const group of ["adult-wear", "kids-wear"]) {
      const source = getPricingCategory("regular")?.groups.find(
        (entry) => entry.slug === group,
      );

      for (const item of itemsForGroup("regular", group)) {
        expect(item.optionKey).toBe(`${group}/${item.key}/0`);
      }

      // Sanity: the groups really do carry a second line, so this is a choice
      // being withheld rather than there being nothing to withhold.
      expect(source?.items[0]?.options).toHaveLength(2);
    }
  });

  it("never points at a line the group does not have", () => {
    for (const category of pricingCategories) {
      for (const group of category.groups) {
        const priced = new Set(
          group.items.flatMap((item) =>
            item.options.map(
              (_, index) => `${group.slug}/${item.slug}/${index}`,
            ),
          ),
        );

        for (const item of itemsForGroup(category.slug, group.slug)) {
          expect(priced.has(item.optionKey)).toBe(true);
        }
      }
    }
  });

  it("gives every row in a group a distinct key", () => {
    for (const category of pricingCategories) {
      for (const group of category.groups) {
        const keys = itemsForGroup(category.slug, group.slug).map(
          (item) => item.optionKey,
        );

        expect(new Set(keys).size).toBe(keys.length);
      }
    }
  });

  it("keys a service the same way in both categories, so a switch re-prices it", () => {
    // Express is the same list at a different price, so the two categories must
    // produce identical keys or switching would silently drop the selection.
    for (const group of getPricingCategory("regular")?.groups ?? []) {
      const keys = (slug: CategorySlug) =>
        itemsForGroup(slug, group.slug).map((item) => item.optionKey);

      expect(keys("express")).toEqual(keys("regular"));
    }
  });

  it("returns nothing for an unknown group", () => {
    expect(itemsForGroup("regular", "no-such-group")).toEqual([]);
  });
});

describe("a picked service", () => {
  it("resolves into a priced line on the confirm step", () => {
    const item = itemsForGroup("regular", "adult-wear")[0];
    if (!item) throw new Error("Expected a service in the wear group");

    const [line] = resolveSelection({ [item.optionKey]: 1 }, "regular");

    expect(line?.item).toBe("Shirt / Pant / T-shirt / Kurta");
    // The variant is not shown on the row but still reaches the team, so the
    // booking line says which service was meant.
    expect(line?.option).toBe("Dry Cleaning");
    expect(line?.qty).toBe(1);
  });

  it("resolves a single-price item with no variant at all", () => {
    const item = itemsForGroup("regular", "shoe-cleaning")[0];
    if (!item) throw new Error("Expected a service in the shoe group");

    const [line] = resolveSelection({ [item.optionKey]: 1 }, "regular");

    expect(line?.item).toBe("Slipper / Sandal");
    expect(line?.option).toBeUndefined();
  });

  it("prices the same pick differently in each category", () => {
    const item = itemsForGroup("regular", "shoe-cleaning")[0];
    if (!item) throw new Error("Expected a service in the shoe group");

    const regular = resolveSelection({ [item.optionKey]: 1 }, "regular");
    const express = resolveSelection({ [item.optionKey]: 1 }, "express");

    expect(express[0]?.unitPrice).toBeGreaterThan(regular[0]?.unitPrice ?? 0);
  });

  it("yields one booked line per picked row", () => {
    const picks = Object.fromEntries(
      itemsForGroup("regular", "household").map((item) => [item.optionKey, 1]),
    );

    expect(resolveSelection(picks, "regular")).toHaveLength(
      itemsForGroup("regular", "household").length,
    );
  });
});
