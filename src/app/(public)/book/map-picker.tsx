"use client";

import { Loader2, LocateFixed, MapPin } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  googleMapsApiKey,
  googleMapsMapId,
  loadGoogleMaps,
} from "@/lib/google-maps";
import { cn } from "@/lib/utils";

import type { LatLng } from "./types";

type MapStatus = "loading" | "ready" | "error";

/** A marker hidden behind one interface so AdvancedMarker and Marker agree. */
type MarkerHandle = {
  set: (position: LatLng) => void;
  get: () => LatLng | null;
  remove: () => void;
};

/**
 * Reads a position from either shape Google returns.
 *
 * `AdvancedMarkerElement.position` is a union of `LatLng` (where lat/lng are
 * methods) and the literal/altitude shapes (where they are numbers), so the
 * accessor has to cope with both.
 */
type PositionLike = {
  lat: number | (() => number);
  lng: number | (() => number);
};

function readPosition(value: PositionLike | null | undefined): LatLng | null {
  if (!value) return null;
  const lat = typeof value.lat === "function" ? value.lat() : value.lat;
  const lng = typeof value.lng === "function" ? value.lng() : value.lng;
  return { lat, lng };
}

type MapPickerProps = {
  /** Store location, used as the initial view and the store pin. */
  center: LatLng;
  value: LatLng | null;
  onChange: (next: LatLng) => void;
  /** Called with a human address after autocomplete or reverse geocoding. */
  onAddressResolved: (address: string) => void;
  /** The address input the Places Autocomplete widget binds to. */
  inputRef: React.RefObject<HTMLInputElement | null>;
  disabled?: boolean;
};

/**
 * Address search + draggable map pin.
 *
 * The store is shown as a separate, fixed pin so the customer can see the
 * reference point they are being measured against. Everything the user does
 * here ultimately calls `onChange` with coordinates; the 6 km verdict itself is
 * decided server side.
 */
export function MapPicker({
  center,
  value,
  onChange,
  onAddressResolved,
  inputRef,
  disabled = false,
}: MapPickerProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<google.maps.Map | null>(null);
  const markerRef = React.useRef<MarkerHandle | null>(null);
  const geocoderRef = React.useRef<google.maps.Geocoder | null>(null);
  const autocompleteRef = React.useRef<google.maps.places.Autocomplete | null>(
    null,
  );
  const onChangeRef = React.useRef(onChange);
  const onAddressRef = React.useRef(onAddressResolved);

  const [status, setStatus] = React.useState<MapStatus>("loading");
  const [geoError, setGeoError] = React.useState<string | null>(null);
  const [locating, setLocating] = React.useState(false);

  // Keep the latest callbacks reachable from Google's long-lived listeners
  // without tearing down and rebuilding the map on every render.
  React.useEffect(() => {
    onChangeRef.current = onChange;
    onAddressRef.current = onAddressResolved;
  }, [onChange, onAddressResolved]);

  const hasKey = Boolean(googleMapsApiKey());

  React.useEffect(() => {
    let cancelled = false;

    if (!hasKey || !containerRef.current) {
      setStatus("error");
      return;
    }

    const container = containerRef.current;

    async function reverseGeocode(position: LatLng): Promise<void> {
      try {
        const geocoder =
          geocoderRef.current ??
          (geocoderRef.current = new window.google.maps.Geocoder());
        const { results } = await geocoder.geocode({ location: position });
        const address = results?.[0]?.formatted_address;
        if (address) onAddressRef.current(address);
      } catch {
        // Reverse geocoding is a nicety; the coordinates still stand.
      }
    }

    function applyPosition(position: LatLng, options: { pan: boolean }) {
      const marker = markerRef.current;
      if (marker) marker.set(position);
      if (options.pan) {
        mapRef.current?.panTo(position);
      }
      onChangeRef.current(position);
    }

    function handleManualPosition(position: LatLng) {
      applyPosition(position, { pan: true });
      void reverseGeocode(position);
    }

    function createMarker(map: google.maps.Map): MarkerHandle {
      const initial = value ?? center;
      const mapId = googleMapsMapId();

      if (mapId) {
        const marker = new window.google.maps.marker.AdvancedMarkerElement({
          map,
          position: initial,
          gmpDraggable: !disabled,
        });

        marker.addListener("dragend", () => {
          const position = readPosition(marker.position);
          if (position) handleManualPosition(position);
        });

        return {
          set: (position) => {
            marker.position = position;
          },
          get: () => readPosition(marker.position),
          remove: () => {
            marker.map = null;
          },
        };
      }

      const marker = new window.google.maps.Marker({
        map,
        position: initial,
        draggable: !disabled,
      });

      marker.addListener("dragend", () => {
        const position = marker.getPosition();
        if (position) {
          handleManualPosition({ lat: position.lat(), lng: position.lng() });
        }
      });

      return {
        set: (position) => {
          marker.setPosition(position);
        },
        get: () => {
          const position = marker.getPosition();
          return position ? { lat: position.lat(), lng: position.lng() } : null;
        },
        remove: () => {
          marker.setMap(null);
        },
      };
    }

    loadGoogleMaps()
      .then(() => {
        if (cancelled || !container) return;

        const map = new window.google.maps.Map(container, {
          center: value ?? center,
          zoom: 14,
          mapId: googleMapsMapId() ?? undefined,
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
          gestureHandling: "greedy",
        });
        mapRef.current = map;

        // Store pin: fixed, and visually secondary to the draggable one.
        new window.google.maps.Marker({
          map,
          position: center,
          title: "UClean store",
          opacity: 0.55,
        });

        markerRef.current = createMarker(map);

        map.addListener("click", (event: google.maps.MapMouseEvent) => {
          if (disabled || !event.latLng) return;
          handleManualPosition({
            lat: event.latLng.lat(),
            lng: event.latLng.lng(),
          });
        });

        const input = inputRef.current;
        if (input) {
          const autocomplete = new window.google.maps.places.Autocomplete(
            input,
            {
              fields: ["formatted_address", "name", "geometry"],
              componentRestrictions: { country: "in" },
            },
          );
          autocompleteRef.current = autocomplete;

          autocomplete.addListener("place_changed", () => {
            const place = autocomplete.getPlace();
            const location = place.geometry?.location;
            if (!location) return;

            const position = { lat: location.lat(), lng: location.lng() };
            applyPosition(position, { pan: true });
            onAddressRef.current(
              place.formatted_address ?? place.name ?? input.value,
            );
          });
        }

        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current = null;
      // The address input outlives the map, so the widget has to let go of it
      // or a remount leaves two listeners fighting over one field.
      autocompleteRef.current?.unbindAll();
      autocompleteRef.current = null;
    };
    // Intentionally initialised once; later value changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasKey]);

  // Reflect a position chosen elsewhere (current location, or a reset) back
  // onto the pin.
  React.useEffect(() => {
    if (status !== "ready" || !value) return;
    const current = markerRef.current?.get();
    if (current && current.lat === value.lat && current.lng === value.lng) {
      return;
    }
    markerRef.current?.set(value);
    mapRef.current?.panTo(value);
  }, [status, value]);

  function useCurrentLocation() {
    setGeoError(null);

    if (!("geolocation" in navigator)) {
      setGeoError("Your browser does not support location access.");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const next = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        markerRef.current?.set(next);
        mapRef.current?.panTo(next);
        onChangeRef.current(next);

        // Reverse geocode through the same geocoder the map already holds.
        const geocoder =
          geocoderRef.current ??
          (geocoderRef.current = new window.google.maps.Geocoder());
        geocoder
          .geocode({ location: next })
          .then(({ results }) => {
            const address = results?.[0]?.formatted_address;
            if (address) onAddressRef.current(address);
          })
          .catch(() => {});
      },
      () => {
        setLocating(false);
        setGeoError(
          "We could not read your location. Drop the pin on the map instead.",
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-xl border border-[var(--border)]">
        {status === "error" ? (
          <div className="bg-muted/40 text-muted-foreground flex h-64 flex-col items-center justify-center gap-2 px-6 text-center text-sm">
            <MapPin className="size-6" aria-hidden="true" />
            <p className="text-foreground font-medium">
              The map is not available right now.
            </p>
            <p>
              You can still share your location and type your address, and we
              will check the distance for you.
            </p>
          </div>
        ) : (
          <div
            ref={containerRef}
            className={cn(
              "h-64 w-full sm:h-72",
              disabled && "pointer-events-none opacity-70",
            )}
          />
        )}

        {status === "loading" ? (
          <div className="bg-background/70 absolute inset-0 flex items-center justify-center">
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            <span className="sr-only">Loading the map</span>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={useCurrentLocation}
          disabled={disabled || locating}
        >
          {locating ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <LocateFixed aria-hidden="true" />
          )}
          {locating ? "Finding you..." : "Use my current location"}
        </Button>
        <p className="text-muted-foreground text-xs">
          Drag the pin, tap the map, or search your address above.
        </p>
      </div>

      {geoError ? (
        <p role="alert" className="text-sm text-[var(--destructive)]">
          {geoError}
        </p>
      ) : null}
    </div>
  );
}
