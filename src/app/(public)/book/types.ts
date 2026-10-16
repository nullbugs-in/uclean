/** Shared types for the public booking wizard. */

export type LatLng = { lat: number; lng: number };

export type WizardStep =
  "details" | "address" | "services" | "slot" | "confirm" | "success";

/**
 * The outcome of the 6 km check.
 *
 * `unconfigured` is its own case on purpose: the store coordinates being unset
 * is an operational problem, not a customer one, so it must not read as "you
 * are too far away".
 */
export type ZoneResult =
  | { status: "within"; distanceKm: number; maxRadiusKm: number }
  | { status: "outside"; distanceKm: number; maxRadiusKm: number }
  | { status: "unconfigured" }
  | { status: "error"; message: string };

export type SlotOption = {
  id: string;
  label: string;
  startTime: string;
  remaining: number;
};

/**
 * Whether the customer's address reached their profile.
 *
 * `idle` before they have left the address step, `saving` while the write is in
 * flight, then a settled outcome. `failed` is the one that matters: it is shown
 * on the success step, because a customer who believes their address was saved
 * and finds nothing on their profile next time is worse than being told it did
 * not stick.
 */
export type AddressSaveState = "idle" | "saving" | "saved" | "failed";

export type SlotDay = {
  /** YYYY-MM-DD */
  dateKey: string;
  isBlocked: boolean;
  slots: SlotOption[];
};

export type BookingSummary = {
  orderId: string;
  orderNo: string;
  slotDate: string;
  slotLabel: string;
  /** The address the booking was made against, shown back for reassurance. */
  addressText: string;
};

export type ActionResult<T> =
  { ok: true; data: T } | { ok: false; message: string };
