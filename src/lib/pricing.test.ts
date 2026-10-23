import { describe, expect, it } from "vitest";

import {
  cheapestPrice,
  deriveExpressCategory,
  EXPRESS_MULTIPLIER,
  EXPRESS_TURNAROUND,
  getPricingCategory,
  itemCount,
  optionCount,
  pricingCategories,
  type PriceCategory,
} from "./pricing";

/**
 * Guards the Express derivation, the one piece of price logic this repo keeps
 * in code now that the figures live in the database. A fixture stands in for
 * the assembled Regular list; the shape the derivation depends on is the shape
 * `src/db/queries/pricing.ts` produces.
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

/** A minimal, deliberate two-group fixture: dual-label wear and single-label shoes. */
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
          name: "Shirt",
          options: [
            { label: "Dry Cleaning", original: 119, price: 99, unit: "piece", turnaround: "3 days" },
            { label: "Steam Ironing", original: 24, price: 20, unit: "piece", turnaround: "2 days" },
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
          slug: "sneaker",
          name: "Sneaker",
          options: [{ original: 299, price: 249, unit: "pair" }],
        },
      ],
    },
  ],
};

describe("pricing file helpers", () => {
  const [regular, express] = pricingCategories(regularFixture);

  it("pairs the fixture as regression and derived categories", () => {
    if (!regular || !express) throw new Error("Expected both categories");
    expect(regular.slug).toBe("regular");
    expect(express.slug).toBe("express");
  });

  it("resolves a category by slug and rejects an unknown one", () => {
    if (!regular || !express) throw new Error("Expected both categories");
    expect(getPricingCategory(regularFixture, "regular")).toBe(regularFixture);
    expect(getPricingCategory(regularFixture, "express")).toStrictEqual(express);
    expect(getPricingCategory(regularFixture, "nope")).toBeUndefined();
  });

  it("counts items and one price line per option", () => {
    if (!regular) throw new Error("Expected regular");
    expect(itemCount(regular)).toBe(2);
    expect(optionCount(regular)).toBe(3);
  });

  it("reports the cheapest line for the category card", () => {
    if (!regular) throw new Error("Expected regular");
    expect(cheapestPrice(regular)).toEqual({ price: 20, unit: "piece" });
  });

  it("refuses a category authored without prices", () => {
    // Every category reaching these helpers is assembled with at least one
    // option; the guard exists so the failure is a clear throw, not a NaN card.
    const empty: PriceCategory = { ...regularFixture, groups: [] };
    expect(() => cheapestPrice(empty)).toThrow("has no prices");
  });
});

describe("express derivation", () => {
  const expressFixture = deriveExpressCategory(regularFixture);

  it("flags itself as derived and names the rule", () => {
    expect(expressFixture.derived).toBe(true);
    expect(expressFixture.derivedFrom).toBeTruthy();
    expect(regularFixture.derived).toBeUndefined();
  });

  it("keeps the same groups and items as the regular list", () => {
    expect(expressFixture.groups.map((group) => group.slug)).toEqual(
      regularFixture.groups.map((group) => group.slug),
    );
    for (const [index, group] of expressFixture.groups.entries()) {
      const source = at(
        regularFixture.groups,
        index,
        `regular group ${group.slug}`,
      );
      expect(group.items.map((item) => item.name)).toEqual(
        source.items.map((item) => item.name),
      );
    }
  });

  it("charges the multiple on both the current and original price", () => {
    for (const [index, group] of expressFixture.groups.entries()) {
      const source = at(
        regularFixture.groups,
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
    for (const group of expressFixture.groups) {
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
    expect(cheapestPrice(expressFixture)).toEqual({
      price: 40,
      unit: "piece",
    });
  });
});
