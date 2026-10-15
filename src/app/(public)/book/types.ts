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
  /** Service subtotal, delivery charge and the quoted total, all in rupees. */
  subtotal: number;
  deliveryCharge: number;
  total: number;
  isFreeDelivery: boolean;
  /** The address the booking was made against, shown back for reassurance. */
  addressText: string;
};

export type ActionResult<T> =
  { ok: true; data: T } | { ok: false; message: string };
