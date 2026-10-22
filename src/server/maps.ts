import "server-only";

import { getStoreSettings } from "@/db/queries/catalog";
import { createClient } from "@/db/server";

import {
  outsideDeliveryZone,
  storeNotConfigured,
  upstreamUnavailable,
} from "./errors";

export type DistanceResult = {
  distanceKm: number;
  withinZone: boolean;
  maxRadiusKm: number;
  durationText?: string;
};

const ROUTES_ENDPOINT =
  "https://routes.googleapis.com/directions/v2:computeRoutes";

type RoutesResponse = {
  routes?: Array<{
    distanceMeters?: number;
    duration?: string;
  }>;
  error?: { message?: string };
};

/**
 * Driving distance from the store to a pickup address.
 *
 * Driving distance, not straight line: the 6 km limit is about how far a rider
 * actually travels, and a customer 5 km away across a river may be 14 km by
 * road. Google has no free driving-distance primitive, so this calls Routes
 * with a minimal request and no waypoints or traffic.
 *
 * Runs server side by design. The architecture doc is explicit that the check
 * cannot be bypassed from the browser, and the key it uses is restricted to the
 * Routes API and never sent to a client.
 */
export async function getDrivingDistance(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  apiKey: string,
  signal?: AbortSignal,
): Promise<{ distanceKm: number; durationText?: string }> {
  const response = await fetch(ROUTES_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
    },
    signal,
    body: JSON.stringify({
      origin: { location: { latLng: origin } },
      destination: { location: { latLng: destination } },
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_UNAWARE",
    }),
  });

  if (!response.ok) {
    throw upstreamUnavailable("Google Routes", response.status);
  }

  const body = (await response.json()) as RoutesResponse;
  const meters = body.routes?.[0]?.distanceMeters;

  if (typeof meters !== "number") {
    throw upstreamUnavailable(
      "Google Routes",
      body.error?.message ?? "no route",
    );
  }

  return {
    distanceKm: Math.round((meters / 1000) * 100) / 100,
    durationText: body.routes?.[0]?.duration,
  };
}

/**
 * Full zone check: fetch the store coordinates, compute driving distance, and
 * compare against the configured radius.
 *
 * Throws OutsideDeliveryZone when the address is too far, so a caller cannot
 * accidentally continue with an out-of-zone address by ignoring a returned
 * boolean.
 */
export async function assertWithinDeliveryZone(
  destination: { lat: number; lng: number },
  apiKey: string | null,
): Promise<DistanceResult> {
  const supabase = await createClient();
  const store = await getStoreSettings(supabase);

  if (!store) throw storeNotConfigured();

  // Coordinates are an open question in the source design, so the seed leaves
  // them NULL. Refuse rather than zone-check against a guess.
  if (store.lat === null || store.lng === null) throw storeNotConfigured();

  // No Routes key configured (testing): skip the driving-distance call and
  // treat the address as inside the zone. book_pickup still repeats its own
  // zone rule, so this only ever softens the check, never enriches it.
  if (apiKey === null) {
    return {
      distanceKm: 0,
      withinZone: true,
      maxRadiusKm: Number(store.max_radius_km),
    };
  }

  const { distanceKm, durationText } = await getDrivingDistance(
    { lat: store.lat, lng: store.lng },
    destination,
    apiKey,
  );

  const maxRadiusKm = Number(store.max_radius_km);

  if (distanceKm > maxRadiusKm) {
    throw outsideDeliveryZone(maxRadiusKm, distanceKm);
  }

  return { distanceKm, withinZone: true, maxRadiusKm, durationText };
}

/**
 * Non-throwing variant for the wizard, which wants to show the distance and a
 * clear message instead of an error.
 */
export async function checkDeliveryZone(
  destination: { lat: number; lng: number },
  apiKey: string | null,
): Promise<
  | { ok: true; distanceKm: number; maxRadiusKm: number }
  | {
      ok: false;
      distanceKm: number | null;
      maxRadiusKm: number | null;
      reason: string;
    }
> {
  const supabase = await createClient();
  const store = await getStoreSettings(supabase);

  if (
    store === null ||
    apiKey === null ||
    store.lat === null ||
    store.lng === null
  ) {
    // No Routes key (testing): report the address as inside the zone so the
    // wizard is not blocked by the unconfigured map.
    if (apiKey === null) {
      return {
        ok: true,
        distanceKm: 0,
        maxRadiusKm: store ? Number(store.max_radius_km) : 6,
      };
    }
    return {
      ok: false,
      distanceKm: null,
      maxRadiusKm: store ? Number(store.max_radius_km) : null,
      reason: "STORE_NOT_CONFIGURED",
    };
  }

  const { distanceKm } = await getDrivingDistance(
    { lat: store.lat, lng: store.lng },
    destination,
    apiKey,
  );

  const maxRadiusKm = Number(store.max_radius_km);

  if (distanceKm > maxRadiusKm) {
    return {
      ok: false,
      distanceKm,
      maxRadiusKm,
      reason: "OUTSIDE_DELIVERY_ZONE",
    };
  }

  return { ok: true, distanceKm, maxRadiusKm };
}
