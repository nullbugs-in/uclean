import { describe, expect, it } from "vitest";

import { storeNow, toDateKey } from "./dates";

/**
 * The store's clock.
 *
 * Asserted as wall-clock values rather than as an offset, so these hold on a
 * machine in any timezone: the whole point of the helper is that the process's
 * own zone never shows through. A version written in terms of
 * `getTimezoneOffset()` would pass here and fail on the UTC runner.
 */

describe("storeNow", () => {
  it("reads the store's clock, not the process's", () => {
    // 12:00 UTC is 17:30 in Kolkata.
    const now = storeNow(new Date("2026-03-10T12:00:00Z"));

    expect(toDateKey(now)).toBe("2026-03-10");
    expect(now.getHours()).toBe(17);
    expect(now.getMinutes()).toBe(30);
  });

  it("rolls the day over at store midnight, not at UTC midnight", () => {
    // 18:30 UTC is exactly midnight in Kolkata, so the store is on the 11th
    // while a UTC process still reads the 10th. This is the shift that would
    // put the wizard a day behind for the first five and a half hours of every
    // store day, and it is why the helper exists.
    const now = storeNow(new Date("2026-03-10T18:30:00Z"));

    expect(toDateKey(now)).toBe("2026-03-11");
    // Hour 0 rather than 24: the 12-hour cycle renders midnight as "24" in some
    // runtimes, which parses back as the wrong day.
    expect(now.getHours()).toBe(0);
    expect(now.getMinutes()).toBe(0);
  });

  it("defaults to the current instant", () => {
    expect(Number.isNaN(storeNow().getTime())).toBe(false);
  });
});
