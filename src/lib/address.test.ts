import { describe, expect, it } from "vitest";

import type { Address } from "@/db/types";

import {
  MIN_ADDRESS_LENGTH,
  isSameAddress,
  isUsableAddress,
  normalizeAddressForComparison,
  pickDefaultAddress,
} from "./address";

function address(overrides: Partial<Address> = {}): Address {
  return {
    id: "a1",
    user_id: "u1",
    label: "Pickup address",
    address_text: "2979/1, D21/1, 6th Main Rd",
    lat: 12.9,
    lng: 77.6,
    distance_km: null,
    is_default: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("normalizeAddressForComparison", () => {
  it("folds case", () => {
    expect(normalizeAddressForComparison("Flat 2, Main Rd")).toBe(
      normalizeAddressForComparison("FLAT 2, MAIN RD"),
    );
  });

  it("folds runs of whitespace", () => {
    expect(normalizeAddressForComparison("Flat  2,   Main Rd")).toBe(
      normalizeAddressForComparison("Flat 2, Main Rd"),
    );
  });

  it("folds a trailing separator", () => {
    expect(normalizeAddressForComparison("Flat 2, Main Rd,")).toBe(
      normalizeAddressForComparison("Flat 2, Main Rd"),
    );
  });

  it("trims the ends", () => {
    expect(normalizeAddressForComparison("  Flat 2  ")).toBe("flat 2");
  });

  /**
   * The reason this is not more aggressive. Two different addresses can differ by
   * as little as a house number, so normalising away punctuation or digits would
   * merge places that are genuinely not the same.
   */
  it("keeps distinctions that make an address different", () => {
    expect(isSameAddress("Flat 2, Main Rd", "Flat 3, Main Rd")).toBe(false);
    expect(isSameAddress("12 Nehru Nagar", "13 Nehru Nagar")).toBe(false);
    expect(isSameAddress("12 Nehru Nagar", "12 MG Road")).toBe(false);
  });
});

describe("isSameAddress", () => {
  const spellings = [
    "Flat 2, Main Road",
    "flat 2, main road",
    "  Flat 2,   Main Road  ",
    "Flat 2, Main Road,",
    "FLAT 2, MAIN ROAD,",
  ];

  it("treats cosmetic differences as the same place", () => {
    const [canonical, ...rest] = spellings;

    for (const spelling of rest) {
      expect(isSameAddress(canonical!, spelling), spelling).toBe(true);
    }
  });

  it("does not treat a different address as the same", () => {
    expect(isSameAddress("Flat 2, Main Road", "Flat 22, Main Road")).toBe(
      false,
    );
    expect(isSameAddress("Flat 2, Main Road", "Flat 2, Cross Road")).toBe(
      false,
    );
  });
});

describe("pickDefaultAddress", () => {
  it("returns null when there is nothing saved", () => {
    expect(pickDefaultAddress([])).toBeNull();
  });

  it("returns the default when one is flagged", () => {
    const first = address({ id: "a1" });
    const preferred = address({ id: "a2", is_default: true });

    expect(pickDefaultAddress([first, preferred])?.id).toBe("a2");
  });

  /**
   * The order `listAddresses` already applies, restated here as an explicit
   * fallback. Nothing requires a default row to exist, so a profile whose default
   * was deleted still has to offer something to prefill.
   */
  it("falls back to the first row when no default is flagged", () => {
    const newest = address({ id: "a1" });
    const older = address({ id: "a2" });

    expect(pickDefaultAddress([newest, older])?.id).toBe("a1");
  });
});

describe("isUsableAddress", () => {
  it("rejects anything shorter than the shared minimum", () => {
    expect(isUsableAddress("a".repeat(MIN_ADDRESS_LENGTH - 1))).toBe(false);
  });

  it("accepts one at the minimum", () => {
    expect(isUsableAddress("a".repeat(MIN_ADDRESS_LENGTH))).toBe(true);
  });

  it("counts the trimmed length, not the typed length", () => {
    // Padded input is still long enough once trimmed.
    expect(isUsableAddress(`  ${"a".repeat(MIN_ADDRESS_LENGTH)}  `)).toBe(true);
    expect(isUsableAddress(`  ${"a".repeat(3)}  `)).toBe(false);
  });
});
