import { loadGoogleMaps } from "@/lib/google-maps";

import type { LatLng } from "./types";

/**
 * Turns a typed address into coordinates.
 *
 * The booking form takes an address on its own, with no map to place a pin on,
 * but the server still needs a point to run the delivery-zone check against
 * (`pickupRequestSchema` requires `lat`/`lng`, and `assertWithinDeliveryZone`
 * re-checks them inside the booking transaction), so the text has to be resolved
 * to a position here in the browser first.
 *
 * Runs on the browser key, which already loads the geocoding library. Returns
 * null rather than throwing: a failed lookup is something the form has to
 * report to the customer, not an exception it has to survive.
 */
export async function forwardGeocode(address: string): Promise<LatLng | null> {
  const trimmed = address.trim();

  if (!trimmed) return null;

  try {
    await loadGoogleMaps();

    const geocoder = new window.google.maps.Geocoder();
    const { results } = await geocoder.geocode({
      address: trimmed,
      componentRestrictions: { country: "in" },
    });

    const location = results?.[0]?.geometry?.location;

    if (!location) return null;

    return { lat: location.lat(), lng: location.lng() };
  } catch {
    return null;
  }
}
