import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

/**
 * Browser-side Google Maps loader.
 *
 * Only ever imported by client components. The browser key is a
 * NEXT_PUBLIC_ variable, so it is safe to inline; the server distance key stays
 * on the server and is unrelated to this file.
 *
 * `setOptions` must run before the first `importLibrary` call, and the Maps JS
 * API refuses to be configured twice, so the load is memoised in a module-level
 * promise and shared by every map on the page.
 */

export function googleMapsApiKey(): string | null {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  return key ? key : null;
}

export function googleMapsMapId(): string | null {
  const id = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID?.trim();
  return id ? id : null;
}

let configured = false;
let loadPromise: Promise<void> | null = null;

async function doLoad(): Promise<void> {
  const key = googleMapsApiKey();
  if (!key) {
    throw new Error("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not configured.");
  }

  if (!configured) {
    setOptions({ key, v: "weekly" });
    configured = true;
  }

  await Promise.all([
    importLibrary("maps"),
    importLibrary("places"),
    importLibrary("geocoding"),
    importLibrary("marker"),
  ]);
}

/**
 * Loads the Maps, Places, Geocoding and Marker libraries once.
 *
 * Returns nothing: the libraries register themselves on the global `google`
 * namespace, which the callers then use directly. A failed load clears the
 * memoised promise so a later retry (for example after the key is fixed) is
 * not permanently poisoned.
 */
export function loadGoogleMaps(): Promise<void> {
  if (!loadPromise) {
    loadPromise = doLoad().catch((error: unknown) => {
      loadPromise = null;
      throw error;
    });
  }
  return loadPromise;
}
