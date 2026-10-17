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
  | "SLOT_TOO_SOON"
  | "SLOT_UNAVAILABLE"
  | "DATE_BLOCKED"
  | "INVALID_TRANSITION"
  | "ZONE_NOTICE_NOT_ACCEPTED"
  | "OTP_RATE_LIMITED"
  | "OTP_ATTEMPTS_EXCEEDED"
  | "MOBILE_ALREADY_REGISTERED"
  | "MOBILE_NOT_REGISTERED"
  | "MOBILE_INVALID"
  | "WALK_IN_MOBILE_IS_STAFF"
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

/**
 * The requested slot starts inside the booking cut-off.
 *
 * The wizard already hides these, so reaching it means the clock moved while the
 * form was open rather than that the customer did anything wrong. Said without
 * the number, because the number does not change the fix and the slots to pick
 * from are on the screen behind this message.
 */
export const slotTooSoon = () =>
  new DomainError(
    "SLOT_TOO_SOON",
    "That pickup slot starts too soon. Please choose a later slot.",
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

/**
 * Signup was attempted for a number that already has an account.
 *
 * Said plainly, because the person typing already knows their own number and is
 * trying to register, not probe. Signup is the one place where this costs
 * nothing: an attacker learns only that a number is taken, and the same fact is
 * obtainable by attempting a login with it.
 */
export const mobileAlreadyRegistered = () =>
  new DomainError(
    "MOBILE_ALREADY_REGISTERED",
    "This mobile number is already registered. Please log in to your existing account.",
    { status: 409 },
  );

/**
 * Login was attempted for a number with no account.
 *
 * Thrown by the server, but deliberately *not* sent to the browser at request
 * time: the action answers with the same generic text it would give for a
 * registered number, so the send endpoint cannot be used to enumerate customers.
 * The browser only ever learns this after verification attempts run out.
 */
export const mobileNotRegistered = () =>
  new DomainError(
    "MOBILE_NOT_REGISTERED",
    "No account was found for this mobile number. Please create a new account to continue.",
    { status: 404 },
  );

/**
 * The number cannot be canonicalised, so no code can be sent.
 *
 * Distinct from the two above on purpose: those are answers about an account,
 * this is a complaint about the input, and the signup form keys off
 * `MOBILE_ALREADY_REGISTERED` to decide whether to offer a login link. Sharing a
 * code between them would make a typo look like an existing account.
 */
export const mobileInvalid = () =>
  new DomainError("MOBILE_INVALID", "Enter a valid 10 digit mobile number.", {
    status: 400,
  });

/**
 * A walk-in was entered against a mobile number that belongs to staff.
 *
 * Its own code rather than `FORBIDDEN`, because it is a mistake in the field
 * rather than a permissions problem: the person taking the order has every right
 * to take it, they have just typed a colleague's number. The form shows this
 * against the mobile input, which `FORBIDDEN` would not.
 *
 * The alternative - quietly creating an order under the staff member's own
 * profile - would put a colleague's name on the customer's delivery and their
 * account in the customer's order history.
 */
export const walkInMobileIsStaff = () =>
  new DomainError(
    "WALK_IN_MOBILE_IS_STAFF",
    "That mobile number belongs to a staff account. Enter the customer's own number.",
    { status: 409 },
  );

/**
 * Too many wrong codes for one number.
 *
 * Also the point at which the login flow stops hiding whether a number is
 * registered, so it doubles as the enumeration brake.
 */
export const otpAttemptsExceeded = (minutes: number) =>
  new DomainError(
    "OTP_ATTEMPTS_EXCEEDED",
    `That code is not valid or has expired. Too many attempts. Please request a new code in ${minutes} minute(s).`,
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
  if (message.includes("too soon")) return slotTooSoon();
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
