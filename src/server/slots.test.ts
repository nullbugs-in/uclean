import { describe, expect, it } from "vitest";

import type { TimeSlot } from "@/db/types";

import { buildRangeAvailability, isSlotTooSoon, selectableSlots } from "./slots";

/** 12:00 on 2026-03-10 is 720 minutes past midnight. */
const TODAY = "2026-03-10";
const NOON = 720;

function slot(id: string, startTime: string, capacity = 2): TimeSlot {
  return {
    id,
    label: null,
    start_time: startTime,
    end_time: startTime,
    capacity,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

const MORNING = slot("morning", "09:00");
const MIDDAY = slot("midday", "12:00");
const EVENING = slot("evening", "18:00");

const DAYS = ["2026-03-10", "2026-03-11", "2026-03-12"];

function build(
  bookings: Array<{ slot_id: string; slot_date: string }> = [],
  blockedDates: string[] = [],
  slots: TimeSlot[] = [MORNING, MIDDAY, EVENING],
  nowMinutes = NOON,
  // A cut-off of 0 hides nothing on top of `isPast`, which is what the tests
  // below are about. The cut-off has its own describe block.
  cutoffMinutes = 0,
) {
  return buildRangeAvailability(
    DAYS,
    slots,
    bookings,
    blockedDates,
    TODAY,
    nowMinutes,
    cutoffMinutes,
  );
}

function names(range: ReturnType<typeof build>, dateKey: string) {
  return selectableSlots(range.get(dateKey)?.slots ?? []).map(
    (entry) => entry.slot.id,
  );
}

describe("buildRangeAvailability", () => {
  it("covers every requested day, including days with no bookings", () => {
    // Inferring the key set from the booking rows would drop these entirely and
    // make a free day read as a day with no slots configured, which would leave
    // most of the calendar unselectable.
    const result = build();

    expect([...result.keys()]).toEqual(DAYS);
    for (const day of result.values()) {
      expect(day.isBlocked).toBe(false);
      expect(day.slots).toHaveLength(3);
      expect(day.slots.every((entry) => entry.booked === 0)).toBe(true);
    }
  });

  it("hides slots that have already passed on today only", () => {
    const result = build();

    // Midday starts at 12:00 and "now" is 12:00, so it counts as gone.
    expect(names(result, TODAY)).toEqual(["evening"]);

    // The same clock time tomorrow is still in the future.
    expect(names(result, "2026-03-11")).toEqual([
      "morning",
      "midday",
      "evening",
    ]);
  });

  it("keeps a slot that is still ahead on the current minute", () => {
    const result = build([], [], [MORNING, MIDDAY], NOON - 1);

    expect(names(result, TODAY)).toEqual(["midday"]);
  });

  it("marks a slot full once its bookings reach its capacity", () => {
    const result = build([
      { slot_id: "morning", slot_date: "2026-03-11" },
      { slot_id: "morning", slot_date: "2026-03-11" },
    ]);

    const morning = result
      .get("2026-03-11")
      ?.slots.find((entry) => entry.slot.id === "morning");

    expect(morning?.booked).toBe(2);
    expect(morning?.isFull).toBe(true);
    expect(morning?.remaining).toBe(0);
    expect(names(result, "2026-03-11")).toEqual(["midday", "evening"]);
  });

  it("counts each booking against its own date", () => {
    const result = build([
      { slot_id: "morning", slot_date: "2026-03-11" },
      { slot_id: "evening", slot_date: "2026-03-12" },
    ]);

    expect(result.get("2026-03-11")?.slots[0]?.booked).toBe(1);
    expect(result.get("2026-03-12")?.slots[2]?.booked).toBe(1);
    expect(result.get(TODAY)?.slots.every((entry) => entry.booked === 0)).toBe(
      true,
    );
  });

  it("flags a blocked date instead of failing the whole range", () => {
    const result = build([], ["2026-03-11"]);

    expect(result.get("2026-03-11")?.isBlocked).toBe(true);
    expect(result.get("2026-03-11")?.slots).toEqual([]);
    expect(result.get("2026-03-12")?.isBlocked).toBe(false);
  });

  it("offers nothing when a slot has no capacity configured", () => {
    // An unconfigured slot must read as unavailable rather than as a free
    // booking that nobody can actually service.
    const result = build([], [], [slot("unset", "09:00", 0)]);

    expect(names(result, TODAY)).toEqual([]);
  });

  it("offers nothing when there are no slots at all", () => {
    const result = build([], [], []);

    expect(result.get(TODAY)?.slots).toEqual([]);
    expect(result.get(TODAY)?.isBlocked).toBe(false);
  });
});

describe("isSlotTooSoon", () => {
  it("leaves a slot further away than the cut-off", () => {
    // 12:00 now, 13:30 slot, 60 minute cut-off.
    expect(isSlotTooSoon(TODAY, 810, TODAY, NOON, 60)).toBe(false);
  });

  it("closes a slot sitting exactly on the cut-off, matching book_pickup", () => {
    // The SQL comparison is `<=`, so a slot 60 minutes out under a 60 minute
    // cut-off is refused. The screen has to agree with the database rather than
    // with the friendlier of the two readings.
    expect(isSlotTooSoon(TODAY, 780, TODAY, NOON, 60)).toBe(true);
    expect(isSlotTooSoon(TODAY, 779, TODAY, NOON, 60)).toBe(true);
  });

  it("closes a slot that has already started, whatever the cut-off", () => {
    expect(isSlotTooSoon(TODAY, 600, TODAY, NOON, 0)).toBe(true);
  });

  it("leaves the next minute alone when the cut-off is 0", () => {
    expect(isSlotTooSoon(TODAY, 721, TODAY, NOON, 0)).toBe(false);
  });

  it("does not carry the cut-off into a later day", () => {
    expect(isSlotTooSoon("2026-03-11", 540, TODAY, NOON, 60)).toBe(false);
  });

  it("carries a cut-off that reaches past midnight into the next morning", () => {
    // 23:00 now with a two hour cut-off puts the boundary at 01:00 tomorrow.
    // Comparing times of day instead of a minute index would wrap at midnight
    // and let the whole night through.
    const LATE = 23 * 60;

    expect(isSlotTooSoon("2026-03-11", 30, TODAY, LATE, 120)).toBe(true);
    expect(isSlotTooSoon("2026-03-11", 60, TODAY, LATE, 120)).toBe(true);
    expect(isSlotTooSoon("2026-03-11", 61, TODAY, LATE, 120)).toBe(false);
  });
});

describe("buildRangeAvailability and the booking cut-off", () => {
  it("hides today's slots inside the cut-off and keeps the rest", () => {
    // Midday now, two hour cut-off, so the boundary is 14:00: the 12:00 slot is
    // on it and goes, the 18:00 slot stays.
    const result = build([], [], [MORNING, MIDDAY, EVENING], NOON, 120);

    expect(names(result, TODAY)).toEqual(["evening"]);
  });

  it("leaves every later day untouched", () => {
    const result = build([], [], [MORNING, MIDDAY, EVENING], NOON, 120);

    expect(names(result, "2026-03-11")).toEqual([
      "morning",
      "midday",
      "evening",
    ]);
  });

  it("records a hidden slot as too soon rather than as full", () => {
    // The three flags tell a customer different things, so the cut-off must not
    // arrive as "this slot is booked out".
    const result = build([], [], [slot("afternoon", "13:00")], NOON, 120);
    const afternoon = result.get(TODAY)?.slots[0];

    expect(afternoon?.isTooSoon).toBe(true);
    expect(afternoon?.isPast).toBe(false);
    expect(afternoon?.isFull).toBe(false);
    expect(afternoon?.remaining).toBe(2);
    expect(names(result, TODAY)).toEqual([]);
  });
});
