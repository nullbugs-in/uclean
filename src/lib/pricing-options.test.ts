import { describe, expect, it } from "vitest";

import { EXPRESS_MULTIPLIER } from "@/data/pricing";

import {
  catalogueGroups,
  catalogueSections,
  defaultGroupForBooking,
  detectBookingSpeed,
  findOptionByName,
  groupForOption,
} from "./pricing-options";

/**
 * The booking invoice form matches a booked line against the public price list
 * twice over: by name (what the customer chose) and by amount (which list the
 * quoted figure came from). These tests pin both halves so the invoice channel
 * cannot drift from what /pricing shows.
 */
describe("catalogueSections", () => {
  it("exposes the same six groups the pricing page shows", () => {
    expect(catalogueGroups("regular").map((group) => group.name)).toEqual([
      "Laundry Services",
      "Adult Wear",
      "Kids Wear",
      "Shoe Cleaning",
      "Household",
      "Curtain Cleaning",
    ]);
  });

  it("restricts a section to the requested group", () => {
    const sections = catalogueSections("regular");
    const shoe = sections.find((section) => section.slug === "shoe-cleaning");

    expect(shoe?.options.length).toBe(4);
    expect(
      sections
        .flatMap((section) => section.options)
        .every((option) => option.price > 0),
    ).toBe(true);
  });

  it("stores wear options exactly as a booking writes them", () => {
    const adult = findOptionByName(
      "Shirt / Pant / T-shirt / Kurta (Dry Cleaning)",
      "regular",
    );

    expect(adult?.name).toBe(
      "Shirt / Pant / T-shirt / Kurta (Dry Cleaning)",
    );
    expect(adult?.unit).toBe("piece");
  });

  it("prices the same named option twice for express", () => {
    const regular = findOptionByName("Wash & Fold", "regular");
    const express = findOptionByName("Wash & Fold", "express");

    expect(express?.price).toBe((regular?.price ?? 0) * EXPRESS_MULTIPLIER);
  });
});

describe("detectBookingSpeed", () => {
  const regular = findOptionByName("Wash & Fold", "regular");
  if (!regular) throw new Error("price list is missing Wash & Fold");

  it("votes regular for lines at the regular price", () => {
    expect(
      detectBookingSpeed([
        { name: regular.name, unitPrice: regular.price },
        { name: "Sports Shoe/Sneaker", unitPrice: 249 },
      ]),
    ).toBe("regular");
  });

  it("votes express when the quoted figure is the listed multiple", () => {
    expect(
      detectBookingSpeed([
        { name: regular.name, unitPrice: regular.price * EXPRESS_MULTIPLIER },
        // A one-kg quantity of a per-kg service must not flip the vote.
        { name: "Wash & Iron", unitPrice: 129 * EXPRESS_MULTIPLIER },
      ]),
    ).toBe("express");
  });

  it("majority decides rather than mixing the two lists", () => {
    expect(
      detectBookingSpeed([
        { name: regular.name, unitPrice: regular.price },
        { name: "Wash & Iron", unitPrice: 129 },
        { name: "Wash & Iron", unitPrice: 129 * EXPRESS_MULTIPLIER },
      ]),
    ).toBe("regular");
  });

  it("falls back to regular for anything it cannot match", () => {
    expect(
      detectBookingSpeed([
        { name: "Store catalogue service", unitPrice: 55 },
        { name: "Arbitrary custom line", unitPrice: 400 },
      ]),
    ).toBe("regular");
  });

  it("ignores quantities that no option on the list prices", () => {
    expect(detectBookingSpeed([])).toBe("regular");
  });
});

describe("group helpers", () => {
  it("reports the group an option key belongs to", () => {
    const adult = findOptionByName(
      "Shirt / Pant / T-shirt / Kurta (Dry Cleaning)",
      "regular",
    );
    if (!adult) throw new Error("price list is missing the shirt row");

    expect(groupForOption(adult.key)).toBe("adult-wear");
  });

  it("opens the category picker on the booked services' group", () => {
    const sneaker = findOptionByName("Sports Shoe / Sneaker", "regular");
    if (!sneaker) throw new Error("price list is missing the sneaker row");

    expect(
      defaultGroupForBooking(
        [{ name: sneaker.name, unitPrice: sneaker.price }],
        "regular",
      ),
    ).toBe("shoe-cleaning");
  });

  it("defaults to the first group when nothing matched", () => {
    expect(
      defaultGroupForBooking(
        [{ name: "Store catalogue service", unitPrice: 55 }],
        "regular",
      ),
    ).toBe("laundry-services");
  });
});
