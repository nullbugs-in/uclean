import { describe, expect, it } from "vitest";

import { EXPRESS_MULTIPLIER, deriveExpressCategory, type PriceCategory } from "@/lib/pricing";

import {
  catalogueGroups,
  catalogueSections,
  categoryForSpeed,
  defaultGroupForBooking,
  detectBookingSpeed,
  findOptionByName,
  groupForOption,
  type PricingCatalogPair,
} from "./pricing-options";

/**
 * The booking invoice form matches a booked line against the public price list
 * twice over: by name (what the customer chose) and by amount (which list the
 * quoted figure came from). These tests pin both halves so the invoice channel
 * cannot drift from what /pricing shows.
 *
 * A fixture stands in for the list the database assembles; the functions under
 * test are pure functions of that pair.
 */

const regularFixture: PriceCategory = {
  slug: "regular",
  name: "Regular",
  tagline: "fixture",
  turnaround: "2 to 3 days",
  groups: [
    {
      slug: "laundry-services",
      name: "Laundry Services",
      items: [
        {
          slug: "wash-fold",
          name: "Wash & Fold",
          options: [{ original: 299, price: 249, unit: "kg" }],
        },
        {
          slug: "wash-iron",
          name: "Wash & Iron",
          options: [{ original: 149, price: 129, unit: "kg" }],
        },
      ],
    },
    {
      slug: "adult-wear",
      name: "Adult Wear",
      items: [
        {
          slug: "shirt-group",
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
          slug: "sneaker",
          name: "Sports Shoe / Sneaker",
          options: [{ original: 299, price: 249, unit: "pair" }],
        },
        {
          slug: "safety-shoe",
          name: "Safety Shoe",
          options: [{ original: 399, price: 349, unit: "pair" }],
        },
      ],
    },
  ],
};

const pairFixture: PricingCatalogPair = {
  regular: regularFixture,
  express: deriveExpressCategory(regularFixture),
};

describe("catalogueSections", () => {
  it("exposes the same groups the pricing page shows, in list order", () => {
    expect(
      catalogueGroups(categoryForSpeed(pairFixture, "regular")).map(
        (group) => group.name,
      ),
    ).toEqual(["Laundry Services", "Adult Wear", "Shoe Cleaning"]);
  });

  it("restricts a section to the requested group", () => {
    const sections = catalogueSections(categoryForSpeed(pairFixture, "regular"));
    const shoe = sections.find((section) => section.slug === "shoe-cleaning");

    expect(shoe?.options.length).toBe(2);
    expect(
      sections
        .flatMap((section) => section.options)
        .every((option) => option.price > 0),
    ).toBe(true);
  });

  it("keys every section under its speed", () => {
    const key = catalogueSections(categoryForSpeed(pairFixture, "regular"))[0]
      ?.options[0]?.key;

    expect(key?.startsWith("regular/")).toBe(true);
    expect(
      catalogueSections(categoryForSpeed(pairFixture, "express"))[0]
        ?.options[0]?.key.startsWith("express/"),
    ).toBe(true);
  });

  it("stores wear options exactly as a booking writes them", () => {
    const adult = findOptionByName(
      pairFixture,
      "Shirt / Pant / T-shirt / Kurta (Dry Cleaning)",
      "regular",
    );

    expect(adult?.name).toBe("Shirt / Pant / T-shirt / Kurta (Dry Cleaning)");
    expect(adult?.unit).toBe("piece");
  });

  it("prices the same named option twice for express", () => {
    const regular = findOptionByName(pairFixture, "Wash & Fold", "regular");
    const express = findOptionByName(pairFixture, "Wash & Fold", "express");

    expect(express?.price).toBe((regular?.price ?? 0) * EXPRESS_MULTIPLIER);
  });
});

describe("detectBookingSpeed", () => {
  const regular = findOptionByName(pairFixture, "Wash & Fold", "regular");
  if (!regular) throw new Error("price list is missing Wash & Fold");

  it("votes regular for lines at the regular price", () => {
    expect(
      detectBookingSpeed(pairFixture, [
        { name: regular.name, unitPrice: regular.price },
        { name: "Sports Shoe / Sneaker", unitPrice: 249 },
      ]),
    ).toBe("regular");
  });

  it("votes express when the quoted figure is the listed multiple", () => {
    expect(
      detectBookingSpeed(pairFixture, [
        { name: regular.name, unitPrice: regular.price * EXPRESS_MULTIPLIER },
        // A one-kg quantity of a per-kg service must not flip the vote.
        { name: "Wash & Iron", unitPrice: 129 * EXPRESS_MULTIPLIER },
      ]),
    ).toBe("express");
  });

  it("majority decides rather than mixing the two lists", () => {
    expect(
      detectBookingSpeed(pairFixture, [
        { name: regular.name, unitPrice: regular.price },
        { name: "Wash & Iron", unitPrice: 129 },
        { name: "Wash & Iron", unitPrice: 129 * EXPRESS_MULTIPLIER },
      ]),
    ).toBe("regular");
  });

  it("falls back to regular for anything it cannot match", () => {
    expect(
      detectBookingSpeed(pairFixture, [
        { name: "Store catalogue service", unitPrice: 55 },
        { name: "Arbitrary custom line", unitPrice: 400 },
      ]),
    ).toBe("regular");
  });

  it("returns regular when nothing matches at all", () => {
    expect(detectBookingSpeed(pairFixture, [])).toBe("regular");
  });
});

describe("group helpers", () => {
  it("reports the group an option key belongs to", () => {
    const adult = findOptionByName(
      pairFixture,
      "Shirt / Pant / T-shirt / Kurta (Dry Cleaning)",
      "regular",
    );
    if (!adult) throw new Error("price list is missing the shirt row");

    expect(groupForOption(adult.key)).toBe("adult-wear");
  });

  it("opens the category picker on the booked services' group", () => {
    const sneaker = findOptionByName(
      pairFixture,
      "Sports Shoe / Sneaker",
      "regular",
    );
    if (!sneaker) throw new Error("price list is missing the sneaker row");

    expect(
      defaultGroupForBooking(
        pairFixture,
        [{ name: sneaker.name, unitPrice: sneaker.price }],
        "regular",
      ),
    ).toBe("shoe-cleaning");
  });

  it("defaults to the first group when nothing matched", () => {
    expect(
      defaultGroupForBooking(
        pairFixture,
        [{ name: "Store catalogue service", unitPrice: 55 }],
        "regular",
      ),
    ).toBe("laundry-services");
  });
});
