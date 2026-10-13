/**
 * Domain errors.
 *
 * Server modules throw these; server actions and route handlers map them to
 * user-facing messages. Keeping them typed means a form can distinguish "you
 * are outside the zone, pick another address" from "the database is down", and
 * show the first as a field error and the second as a retryable failure.
 */

export type DomainErrorCode =
  | "OUTSIDE_DELIVERY_ZONE"
  | "STORE_NOT_CONFIGURED"
  | "SLOT_FULL"
  | "SLOT_UNAVAILABLE"
  | "DATE_BLOCKED"
  | "INVALID_TRANSITION"
  | "ZONE_NOTICE_NOT_ACCEPTED"
  | "OTP_RATE_LIMITED"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "INVALID_PAYMENT_TOKEN"
  | "PAYMENT_LINK_EXPIRED"
  | "UPSTREAM_UNAVAILABLE";

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly userMessage: string;
  readonly status: number;

  constructor(
    code: DomainErrorCode,
    userMessage: string,
    options: { status?: number; cause?: unknown } = {},
  ) {
    super(userMessage, { cause: options.cause });
    this.name = "DomainError";
    this.code = code;
    this.userMessage = userMessage;
    this.status = options.status ?? 400;
  }
}

export const outsideDeliveryZone = (maxKm: number, distanceKm: number) =>
  new DomainError(
    "OUTSIDE_DELIVERY_ZONE",
    `Pickup is available only within ${maxKm} km of the store. This address is about ${distanceKm.toFixed(
      1,
    )} km away.`,
  );

export const storeNotConfigured = () =>
  new DomainError(
    "STORE_NOT_CONFIGURED",
    "The store location has not been configured yet. Please contact us on WhatsApp.",
    { status: 503 },
  );

export const slotFull = () =>
  new DomainError(
    "SLOT_FULL",
    "That pickup slot is already full. Please choose another.",
  );

export const slotUnavailable = () =>
  new DomainError(
    "SLOT_UNAVAILABLE",
    "That pickup slot is no longer available. Please choose another.",
  );

export const dateBlocked = (date: string) =>
  new DomainError("DATE_BLOCKED", `Pickups are not available on ${date}.`);

export const invalidTransition = (from: string, to: string) =>
  new DomainError(
    "INVALID_TRANSITION",
    `An order cannot move from ${from} to ${to}.`,
    { status: 409 },
  );

export const zoneNoticeNotAccepted = () =>
  new DomainError(
    "ZONE_NOTICE_NOT_ACCEPTED",
    "Please accept the delivery area notice to continue.",
  );

export const otpRateLimited = (minutes: number) =>
  new DomainError(
    "OTP_RATE_LIMITED",
    `Too many code requests. Please try again in ${minutes} minute(s).`,
    { status: 429 },
  );

export const unauthenticated = () =>
  new DomainError("UNAUTHENTICATED", "Please sign in to continue.", {
    status: 401,
  });

export const forbidden = () =>
  new DomainError("FORBIDDEN", "You do not have access to this page.", {
    status: 403,
  });

export const invalidPaymentToken = () =>
  new DomainError("INVALID_PAYMENT_TOKEN", "This payment link is not valid.", {
    status: 404,
  });

export const paymentLinkExpired = () =>
  new DomainError("PAYMENT_LINK_EXPIRED", "This payment link has expired.", {
    status: 410,
  });

export const upstreamUnavailable = (service: string, cause?: unknown) =>
  new DomainError(
    "UPSTREAM_UNAVAILABLE",
    "We could not reach a service we depend on. Please try again.",
    { status: 502, cause },
  );

/** Maps a Postgres error raised by one of our SQL functions to a DomainError. */
export function fromDatabaseError(error: {
  message: string;
}): DomainError | null {
  const message = error.message.toLowerCase();

  if (message.includes("outside the") && message.includes("delivery zone")) {
    return new DomainError("OUTSIDE_DELIVERY_ZONE", message, { status: 400 });
  }
  if (message.includes("store location is not configured")) {
    return storeNotConfigured();
  }
  if (message.includes("slot is full")) return slotFull();
  if (
    message.includes("slot is not active") ||
    message.includes("slot not found")
  ) {
    return slotUnavailable();
  }
  if (message.includes("not available on")) return dateBlocked(message);
  if (message.includes("invalid order status transition")) {
    return new DomainError("INVALID_TRANSITION", message, { status: 409 });
  }
  if (message.includes("delivery zone notice")) return zoneNoticeNotAccepted();

  return null;
}
