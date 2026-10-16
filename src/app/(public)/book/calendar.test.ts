import { describe, expect, it } from "vitest";

import {
  addMonths,
  buildMonthCells,
  dateKeyOf,
  isBookable,
  monthOf,
  type PickableDay,
} from "./calendar";

/** A day the customer may pick: not blocked, with at least one free slot. */
const open: PickableDay = { isBlocked: false, slots: [{ id: "a" }] };

/** Configured but fully booked. */
const full: PickableDay = { isBlocked: false, slots: [] };

/** The store is closed. */
const blocked: PickableDay = { isBlocked: true, slots: [{ id: "a" }] };

function cellsFor(
  year: number,
  month: number,
  days: Array<[string, PickableDay]>,
) {
  return buildMonthCells({ year, month }, new Map(days));
}

/** The day cells only, blanks dropped. */
function dayCells(cells: ReturnType<typeof buildMonthCells>) {
  return cells.filter(
    (cell): cell is Extract<typeof cell, { kind: "day" }> =>
      cell.kind === "day",
  );
}

/** Whether a given day-of-month cell is bookable. */
function availableOn(
  cells: ReturnType<typeof buildMonthCells>,
  dayNumber: number,
) {
  return dayCells(cells).find((cell) => cell.dayNumber === dayNumber)
    ?.available;
}

describe("monthOf", () => {
  it("reads a date key as a zero-based month", () => {
    expect(monthOf("2026-03-10")).toEqual({
      year: 2026,
      month: 2,
      key: "2026-2",
    });
  });

  it("treats January as month zero, not month one", () => {
    expect(monthOf("2026-01-01").month).toBe(0);
  });

  it("falls back to the current month rather than the epoch", () => {
    const now = new Date();

    for (const input of [null, "", "not-a-date"]) {
      const result = monthOf(input);
      expect(result.year).toBe(now.getFullYear());
      expect(result.month).toBe(now.getMonth());
    }
  });
});

describe("addMonths", () => {
  it("rolls forwards into the next year", () => {
    expect(addMonths({ year: 2026, month: 11 }, 1)).toEqual({
      year: 2027,
      month: 0,
      key: "2027-0",
    });
  });

  it("rolls backwards into the previous year", () => {
    expect(addMonths({ year: 2026, month: 0 }, -1)).toEqual({
      year: 2025,
      month: 11,
      key: "2025-11",
    });
  });

  it("gives two months the same key so paging can stop at the edges", () => {
    const start = monthOf("2026-03-10");

    expect(addMonths({ year: 2026, month: 2 }, 0).key).toBe(start.key);
    expect(addMonths(start, -1).key).not.toBe(start.key);
  });
});

describe("dateKeyOf", () => {
  it("zero-pads single digit months and days", () => {
    expect(dateKeyOf(2026, 2, 7)).toBe("2026-03-07");
    expect(dateKeyOf(2026, 11, 25)).toBe("2026-12-25");
  });
});

describe("isBookable", () => {
  it("accepts a day with a free slot", () => {
    expect(isBookable(open)).toBe(true);
  });

  it("rejects a fully booked day", () => {
    expect(isBookable(full)).toBe(false);
  });

  it("rejects a blocked day even when slots are listed", () => {
    expect(isBookable(blocked)).toBe(false);
  });

  it("rejects a day that is outside the fetched window", () => {
    expect(isBookable(undefined)).toBe(false);
  });
});

describe("buildMonthCells", () => {
  // March 2026 starts on a Sunday, so a Monday-first grid needs six blanks.
  it("pads a month that starts on Sunday so Monday leads", () => {
    const cells = cellsFor(2026, 2, []);

    expect(cells.slice(0, 6).every((cell) => cell.kind === "blank")).toBe(true);
    expect(dayCells(cells)[0]?.dayNumber).toBe(1);
  });

  it("does not pad a month that starts on Monday", () => {
    // June 2026 starts on a Monday.
    const cells = cellsFor(2026, 5, []);

    expect(cells[0]?.kind).toBe("day");
  });

  it("covers every day of the month", () => {
    expect(dayCells(cellsFor(2026, 2, []))).toHaveLength(31);
    expect(dayCells(cellsFor(2026, 1, []))).toHaveLength(28);
  });

  it("covers a leap February", () => {
    expect(dayCells(cellsFor(2028, 1, []))).toHaveLength(29);
  });

  it("marks only the days in the window as available", () => {
    const cells = cellsFor(2026, 2, [
      ["2026-03-10", open],
      ["2026-03-11", full],
      ["2026-03-12", blocked],
    ]);

    expect(availableOn(cells, 10)).toBe(true);
    expect(availableOn(cells, 11)).toBe(false);
    expect(availableOn(cells, 12)).toBe(false);

    // Every other day of the month is outside the window.
    expect(availableOn(cells, 1)).toBe(false);
  });

  it("gives each day the key the server used", () => {
    const cells = dayCells(cellsFor(2026, 2, [["2026-03-05", open]]));

    expect(cells[4]?.dateKey).toBe("2026-03-05");
  });
});
