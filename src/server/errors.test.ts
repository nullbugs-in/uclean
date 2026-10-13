import { describe, expect, it } from "vitest";

import {
  DomainError,
  fromDatabaseError,
  invalidPaymentToken,
  invalidTransition,
  outsideDeliveryZone,
  otpRateLimited,
  slotFull,
} from "./errors";

describe("DomainError", () => {
  it("carries a user facing message and a status", () => {
    const error = new DomainError("SLOT_FULL", "That slot is full.", {
      status: 409,
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("SLOT_FULL");
    expect(error.userMessage).toBe("That slot is full.");
    expect(error.status).toBe(409);
  });

  it("defaults to status 400", () => {
    expect(new DomainError("SLOT_FULL", "x").status).toBe(400);
  });
});

describe("factory errors", () => {
  it("names the radius and the measured distance when out of zone", () => {
    const error = outsideDeliveryZone(6, 8.4);
    expect(error.code).toBe("OUTSIDE_DELIVERY_ZONE");
    expect(error.userMessage).toContain("6 km");
    expect(error.userMessage).toContain("8.4 km");
  });

  it("marks a rate limit as retryable with 429", () => {
    expect(otpRateLimited(15).status).toBe(429);
  });

  it("hides an invalid transition behind a 409", () => {
    expect(invalidTransition("delivered", "pickup_requested").status).toBe(409);
  });

  it("does not leak a payment token through the message", () => {
    expect(invalidPaymentToken().status).toBe(404);
  });
});

describe("fromDatabaseError", () => {
  it("maps a zone rejection raised by book_pickup", () => {
    const mapped = fromDatabaseError({
      message:
        "Address is outside the 6.00 km delivery zone (distance 9.20 km)",
    });
    expect(mapped?.code).toBe("OUTSIDE_DELIVERY_ZONE");
  });

  it("maps an unconfigured store", () => {
    const mapped = fromDatabaseError({
      message: "Store location is not configured yet",
    });
    expect(mapped?.code).toBe("STORE_NOT_CONFIGURED");
  });

  it("maps a full slot", () => {
    expect(fromDatabaseError({ message: "Pickup slot is full" })?.code).toBe(
      "SLOT_FULL",
    );
  });

  it("maps an invalid transition raised by the trigger", () => {
    const mapped = fromDatabaseError({
      message: "Invalid order status transition: delivered -> picked_up",
    });
    expect(mapped?.code).toBe("INVALID_TRANSITION");
  });

  it("maps a missing zone notice", () => {
    expect(
      fromDatabaseError({
        message: "Delivery zone notice must be accepted first",
      })?.code,
    ).toBe("ZONE_NOTICE_NOT_ACCEPTED");
  });

  it("returns null for an unrecognised error so it is not swallowed", () => {
    expect(
      fromDatabaseError({ message: "connection reset by peer" }),
    ).toBeNull();
    expect(slotFull().code).toBe("SLOT_FULL");
  });
});
