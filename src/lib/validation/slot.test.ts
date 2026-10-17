import { describe, expect, it } from "vitest";

import { blockedDateSchema, slotSettingsSchema } from "./slot";

/**
 * Guards the payloads the admin Slots page submits.
 *
 * Capacity is the switch that decides whether the wizard offers a slot at all,
 * so the rules that matter are the ones that keep a bad number out: negative,
 * fractional, NaN or beyond the sanity bound. A capacity of 0 is deliberately
 * valid -- that is how an admin closes a slot.
 */

const slot = {
  id: "11111111-1111-1111-1111-111111111111",
  capacity: 9,
  label: "10 AM - 11 AM",
  isActive: true,
};

describe("slotSettingsSchema", () => {
  it("accepts a well-formed grid", () => {
    expect(slotSettingsSchema.safeParse({ slots: [slot] }).success).toBe(true);
  });

  it("accepts a capacity of 0, which closes the slot", () => {
    const parsed = slotSettingsSchema.safeParse({
      slots: [{ ...slot, capacity: 0 }],
    });

    expect(parsed.success).toBe(true);
  });

  it("accepts a null label", () => {
    expect(
      slotSettingsSchema.safeParse({ slots: [{ ...slot, label: null }] })
        .success,
    ).toBe(true);
  });

  it("rejects a negative, fractional, NaN or absurd capacity", () => {
    for (const capacity of [-1, 2.5, Number.NaN, 5000]) {
      expect(
        slotSettingsSchema.safeParse({ slots: [{ ...slot, capacity }] })
          .success,
      ).toBe(false);
    }
  });

  it("rejects an empty grid", () => {
    const parsed = slotSettingsSchema.safeParse({ slots: [] });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toMatch(/no slots/i);
    }
  });
});

describe("blockedDateSchema", () => {
  it("accepts a real calendar date with a reason", () => {
    const parsed = blockedDateSchema.safeParse({
      date: "2026-10-20",
      reason: "Diwali",
    });

    expect(parsed.success).toBe(true);
  });

  it("accepts a blank reason and trims it", () => {
    const parsed = blockedDateSchema.safeParse({
      date: "2026-10-20",
      reason: "   ",
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.reason).toBe("");
  });

  it("rejects a malformed date", () => {
    for (const date of ["20-10-2026", "2026/10/20", "2026-1-2", ""]) {
      expect(blockedDateSchema.safeParse({ date, reason: null }).success).toBe(
        false,
      );
    }
  });

  it("rejects a date that does not exist", () => {
    const parsed = blockedDateSchema.safeParse({
      date: "2026-02-31",
      reason: null,
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toMatch(/does not exist/);
    }
  });
});
