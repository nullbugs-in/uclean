import { describe, expect, it } from "vitest";

import { canonicalizeMobile, formatMobileForDisplay } from "./mobile";

describe("canonicalizeMobile", () => {
  it("adds the country code to a bare ten digit number", () => {
    expect(canonicalizeMobile("9876543210")).toBe("+919876543210");
  });

  it("absorbs a leading trunk zero", () => {
    expect(canonicalizeMobile("09876543210")).toBe("+919876543210");
  });

  it("absorbs a country code typed on its own", () => {
    expect(canonicalizeMobile("919876543210")).toBe("+919876543210");
    expect(canonicalizeMobile("+919876543210")).toBe("+919876543210");
    expect(canonicalizeMobile("0919876543210")).toBe("+919876543210");
  });

  it("strips the separators people actually type", () => {
    const expected = "+919876543210";
    expect(canonicalizeMobile("98765 43210")).toBe(expected);
    expect(canonicalizeMobile("98765-43210")).toBe(expected);
    expect(canonicalizeMobile("(98765) 43210")).toBe(expected);
    expect(canonicalizeMobile("+91 98765 43210")).toBe(expected);
    expect(canonicalizeMobile("  9876543210  ")).toBe(expected);
  });

  /**
   * The reason this module exists. Every one of these is the same person, and
   * before canonicalisation each became a separate identity, a separate
   * database row and a separate rate-limit bucket.
   */
  it("gives every spelling of one number the same canonical value", () => {
    const expected = "+919876543210";
    const spellings = [
      "9876543210",
      "09876543210",
      "919876543210",
      "+919876543210",
      "0919876543210",
      "98765 43210",
      "+91-98765-43210",
    ];

    for (const spelling of spellings) {
      expect(canonicalizeMobile(spelling), spelling).toBe(expected);
    }
  });

  it("rejects a number that is too short rather than guessing", () => {
    expect(canonicalizeMobile("987654321")).toBeNull();
    expect(canonicalizeMobile("98765")).toBeNull();
    expect(canonicalizeMobile("")).toBeNull();
  });

  it("rejects a number that is too long", () => {
    expect(canonicalizeMobile("98765432101234")).toBeNull();
  });

  it("rejects text that is not a number", () => {
    expect(canonicalizeMobile("not a number")).toBeNull();
    expect(canonicalizeMobile("+91notanumber")).toBeNull();
  });

  it("does not accept a ten digit number that cannot be Indian", () => {
    // Every Indian mobile starts 6-9. A ten digit number starting 2-5 is not
    // one, and quietly relabelling it +91 would send the code to a stranger.
    expect(canonicalizeMobile("2025550123")).toBeNull();
    expect(canonicalizeMobile("5123456789")).toBeNull();
  });

  it("rejects a foreign number even when the country code is typed", () => {
    expect(canonicalizeMobile("+12025550123")).toBeNull();
    expect(canonicalizeMobile("12025550123")).toBeNull();
  });
});

describe("formatMobileForDisplay", () => {
  it("groups the national number the way it is written here", () => {
    expect(formatMobileForDisplay("+919876543210")).toBe("98765 43210");
  });

  it("leaves anything unexpected untouched", () => {
    expect(formatMobileForDisplay("+14155550123")).toBe("+14155550123");
  });
});
