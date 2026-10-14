import { describe, expect, it } from "vitest";

import {
  cheapestPrice,
  EXPRESS_MULTIPLIER,
  EXPRESS_TURNAROUND,
  expressCategory,
  getPricingCategory,
  itemCount,
  optionCount,
  pricingCategories,
  regularPriceList,
} from "./pricing";

/**
 * Guards the hand-transcribed price list. The numbers come from a markdown file
 * rather than a database, so nothing else would catch a typo here before it
 * reached customers.
 */

/**
 * Indexing with a narrowing guard. `noUncheckedIndexedAccess` is on, and a
 * bare index would just move the error from the type checker into a confusing
 * runtime failure; this names what went missing instead.
 */
function at<T>(list: readonly T[], index: number, context: string): T {
  const value = list[index];
  if (value === undefined) {
    throw new Error(`Expected ${context} at index ${index}`);
  }
  return value;
}

describe("pricing categories", () => {
  it("exposes exactly the two documented categories", () => {
    expect(pricingCategories.map((category) => category.slug)).toEqual([
      "regular",
      "express",
    ]);
  });

  it("resolves a category by slug and rejects an unknown one", () => {
    expect(getPricingCategory("regular")).toBe(regularPriceList);
    expect(getPricingCategory("express")).toBe(expressCategory);
    expect(getPricingCategory("nope")).toBeUndefined();
  });

  it("gives every category groups, items and a turnaround", () => {
    for (const category of pricingCategories) {
      expect(category.groups.length).toBeGreaterThan(0);
      expect(category.turnaround).toBeTruthy();
      expect(itemCount(category)).toBeGreaterThan(0);
    }
  });
});

describe("price data integrity", () => {
  it("transcribes every regular item from the price list", () => {
    // 3 laundry + 23 adult + 11 kids + 4 shoes + 6 household.
    expect(itemCount(regularPriceList)).toBe(47);
  });

  it("keeps group slugs unique inside a category", () => {
    for (const category of pricingCategories) {
      const slugs = category.groups.map((group) => group.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
    }
  });

  it("keeps item slugs unique inside a group", () => {
    // Deliberately not per-category: "choli-plain" and "lehenga-plain" appear
    // in both Adult Wear and Kids Wear, so items are addressed as
    // "<group>/<item>".
    for (const category of pricingCategories) {
      for (const group of category.groups) {
        const slugs = group.items.map((item) => item.slug);
        expect(new Set(slugs).size).toBe(slugs.length);
      }
    }
  });

  it("never prices an item above its struck-through original", () => {
    for (const category of pricingCategories) {
      for (const group of category.groups) {
        for (const item of group.items) {
          for (const option of item.options) {
            expect(option.price).toBeGreaterThan(0);
            expect(option.price).toBeLessThanOrEqual(option.original);
            expect(option.unit).toBeTruthy();
          }
        }
      }
    }
  });

  it("applies a real discount to at least some items", () => {
    // Guards against transcribing the wrong column into `price` everywhere.
    const discounted = pricingCategories
      .flatMap((category) => category.groups)
      .flatMap((group) => group.items)
      .flatMap((item) => item.options)
      .filter((option) => option.price < option.original);

    expect(discounted.length).toBeGreaterThan(0);
  });

  it("counts one price line per option, so dual-price items count twice", () => {
    // 3 laundry + (23 + 11) * 2 + 4 shoes + 6 household = 81.
    expect(optionCount(regularPriceList)).toBe(81);
  });

  it("reports the cheapest price for the category card", () => {
    // Steam ironing on Kids Wear shorts is the lowest line on the list.
    expect(cheapestPrice(regularPriceList)).toEqual({
      price: 15,
      unit: "piece",
    });
  });
});

describe("express derivation", () => {
  it("flags itself as derived and names the rule", () => {
    expect(expressCategory.derived).toBe(true);
    expect(expressCategory.derivedFrom).toBeTruthy();
    expect(regularPriceList.derived).toBeUndefined();
  });

  it("keeps the same groups and items as the regular list", () => {
    expect(expressCategory.groups.map((group) => group.slug)).toEqual(
      regularPriceList.groups.map((group) => group.slug),
    );
    for (const [index, group] of expressCategory.groups.entries()) {
      const source = at(
        regularPriceList.groups,
        index,
        `regular group ${group.slug}`,
      );
      expect(group.items.map((item) => item.name)).toEqual(
        source.items.map((item) => item.name),
      );
    }
  });

  it("charges the multiple on both the current and original price", () => {
    for (const [index, group] of expressCategory.groups.entries()) {
      const source = at(
        regularPriceList.groups,
        index,
        `regular group ${group.slug}`,
      );
      for (const [itemIndex, item] of group.items.entries()) {
        const sourceItem = at(
          source.items,
          itemIndex,
          `regular item in ${group.slug}`,
        );
        for (const [optionIndex, option] of item.options.entries()) {
          const sourceOption = at(
            sourceItem.options,
            optionIndex,
            `regular option in ${group.slug}/${item.slug}`,
          );
          expect(option.price).toBe(sourceOption.price * EXPRESS_MULTIPLIER);
          expect(option.original).toBe(
            sourceOption.original * EXPRESS_MULTIPLIER,
          );
        }
      }
    }
  });

  it("replaces every turnaround with the express one", () => {
    for (const group of expressCategory.groups) {
      // The 3 day group default must not leak through from the source.
      expect(group.turnaround).toBeUndefined();
      for (const item of group.items) {
        for (const option of item.options) {
          expect(option.turnaround).toBe(EXPRESS_TURNAROUND);
        }
      }
    }
  });

  it("doubles the headline price", () => {
    expect(cheapestPrice(expressCategory)).toEqual({
      price: 30,
      unit: "piece",
    });
  });
});
