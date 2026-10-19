import { describe, expect, it } from "vitest";

import { orderTrackingHref, readTrackedOrderId } from "./notifications";

/**
 * The deep link between the bell and the bookings page.
 *
 * `orderTrackingHref` builds the URL the bell navigates to; `readTrackedOrderId`
 * parses it back on the other side. Both live here rather than in a component so
 * the two halves of one contract can be asserted against each other - if the
 * query param were renamed in one place only, this is what would catch it.
 */

const UUID = "11111111-1111-4111-8111-111111111111";

describe("orderTrackingHref", () => {
  it("points at the bookings page with the order param", () => {
    expect(orderTrackingHref(UUID)).toBe(`/account/orders?order=${UUID}`);
  });

  it("round-trips through the reader", () => {
    expect(
      readTrackedOrderId(orderTrackingHref(UUID).split("?order=")[1]),
    ).toBe(UUID);
  });

  it("encodes an id rather than splicing it into the query raw", () => {
    // Order ids are UUIDs today, so this is belt-and-braces: it keeps a
    // malformed id from being able to append a second query parameter.
    expect(orderTrackingHref("a&b=c")).toBe("/account/orders?order=a%26b%3Dc");
  });
});

describe("readTrackedOrderId", () => {
  it("accepts a UUID", () => {
    expect(readTrackedOrderId(UUID)).toBe(UUID);
  });

  it("accepts an upper-case UUID", () => {
    expect(readTrackedOrderId(UUID.toUpperCase())).toBe(UUID.toUpperCase());
  });

  it("takes the first value when the param repeats", () => {
    expect(readTrackedOrderId([UUID, "other"])).toBe(UUID);
  });

  it("trims surrounding whitespace", () => {
    expect(readTrackedOrderId(`  ${UUID}  `)).toBe(UUID);
  });

  it("returns null when there is no order to track", () => {
    expect(readTrackedOrderId(undefined)).toBeNull();
    expect(readTrackedOrderId("")).toBeNull();
    expect(readTrackedOrderId("   ")).toBeNull();
  });

  it("returns null for anything that is not a UUID", () => {
    // A hand-edited or truncated value must leave the page in its ordinary
    // state rather than hunting for an order that cannot exist.
    expect(readTrackedOrderId("not-a-uuid")).toBeNull();
    expect(readTrackedOrderId(UUID.slice(0, 8))).toBeNull();
    expect(readTrackedOrderId(`${UUID}extra`)).toBeNull();
    expect(readTrackedOrderId("../admin")).toBeNull();
  });
});
