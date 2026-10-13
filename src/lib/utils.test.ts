import { describe, expect, it } from "vitest";

import { cn, formatDate, formatDateTime, formatINR } from "./utils";

describe("formatINR", () => {
  it("formats rupees with two decimals", () => {
    expect(formatINR(1234.5)).toMatch(/1,234\.50/);
  });

  it("handles a numeric string from Postgres", () => {
    expect(formatINR("240.00")).toMatch(/240\.00/);
  });

  it("treats null and undefined as zero rather than NaN", () => {
    expect(formatINR(null)).toMatch(/0\.00/);
    expect(formatINR(undefined)).toMatch(/0\.00/);
  });

  it("never renders NaN", () => {
    expect(formatINR("not a number")).not.toContain("NaN");
  });
});

describe("formatDate", () => {
  it("returns a dash for a missing value", () => {
    expect(formatDate(null)).toBe("-");
    expect(formatDate(undefined)).toBe("-");
  });

  it("returns a dash for an unparseable value", () => {
    expect(formatDate("garbage")).toBe("-");
  });
});

describe("formatDateTime", () => {
  it("returns a dash for a missing value", () => {
    expect(formatDateTime(null)).toBe("-");
  });
});

describe("cn", () => {
  it("merges conflicting tailwind classes in favour of the last", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("drops falsy values", () => {
    expect(cn("p-2", false && "hidden", undefined, null)).toBe("p-2");
  });
});
