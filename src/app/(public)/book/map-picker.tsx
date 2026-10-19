"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  LocateFixed,
  MapPin,
  XCircle,
} from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  googleMapsApiKey,
  googleMapsMapId,
  loadGoogleMaps,
} from "@/lib/google-maps";
import { cn } from "@/lib/utils";

import type { LatLng, ZoneResult } from "./types";

type MapStatus = "loading" | "ready" | "error";

/**
 * Colours Google paints onto its own canvas, so they are hex rather than the
 * app's oklch tokens: `CircleOptions.fillColor` and `PinElementOptions.
 * background` are handed straight to Google's renderer, where `oklch()` is not
 * guaranteed to resolve. Each one mirrors a token — `within` is the green of
 * `--primary`, `outside` is the amber the zone banner uses.
 */
const MAP_COLOURS = {
  within: { stroke: "#16a34a", fill: "#22c55e" },
  outside: { stroke: "#d97706", fill: "#f59e0b" },
  neutral: { stroke: "#94a3b8", fill: "#cbd5e1" },
} as const;

type ZoneTone = keyof typeof MAP_COLOURS;

function zoneTone(zone: ZoneResult | null): ZoneTone {
  if (zone?.status === "within") return "within";
  if (zone?.status === "outside") return "outside";
  return "neutral";
}

/** Rough metres per screen pixel, so a tolerance can be expressed in metres. */
function metresPerPixel(zoom: number, latitudeDeg: number): number {
  return (
    (156543.03392 * Math.cos((latitudeDeg * Math.PI) / 180)) / Math.pow(2, zoom)
  );
}

/**
 * Whether the map's centre is effectively sitting on `point`.
 *
 * The Maps API snaps the centre to the nearest pixel, so an exact comparison
 * would report a phantom move after every `panTo`, re-run the zone check and
 * overwrite the address the customer just picked. A tolerance of one and a
 * half pixels absorbs that snapping; a deliberate drag is always hundreds of
 * pixels, so it never hides a real placement.
 */
function centreAt(map: google.maps.Map, point: LatLng): boolean {
  const current = map.getCenter();
  if (!current) return false;

  const latitude = current.lat();
  const tolerance = 1.5 * metresPerPixel(map.getZoom() ?? 14, latitude);
  const northMetres = (latitude - point.lat) * 111320;
  const eastMetres =
    (current.lng() - point.lng) * 111320 * Math.cos((latitude * Math.PI) / 180);

  return Math.hypot(northMetres, eastMetres) <= tolerance;
}

/** What the centre pin should look like. */
type PinState = "unplaced" | "placed" | "outside" | "checking";

type MapPickerProps = {
  /** Store location: the map's opening view, the store pin, and the ring centre. */
  center: LatLng;
  /** The confirmed pickup point, or null until the customer first moves the map. */
  value: LatLng | null;
  onChange: (next: LatLng) => void;
  /** Called with a human address after autocomplete or reverse geocoding. */
  onAddressResolved: (address: string) => void;
  /** The address input the Places Autocomplete widget binds to. */
  inputRef: React.RefObject<HTMLInputElement | null>;
  /** Drawn as a translucent ring around the store, in kilometres. */
  maxRadiusKm: number;
  /** The server's verdict: drives the ring colour and the chip. */
  zone: ZoneResult | null;
  /** True while a distance check is in flight. */
  checking: boolean;
  disabled?: boolean;
  /** Lets the parent fuse this to the address field by dropping the frame. */
  className?: string;
};

/**
 * The pickup map.
 *
 * The customer pans the map under a pin that stays fixed at the centre — the
 * arrangement ride-hailing apps converged on, because grabbing a small marker
 * on a touch screen is fiddly and easy to mis-tap. Everything the customer does
 * here ends in one call to `onChange` with the point under that pin; the 6 km
 * verdict itself is always decided server side, never here.
 *
 * Until the customer actually moves the map, `value` stays null and the pin is
 * drawn hollow. That is deliberate: the map opens on the store, so without a
 * distinct unplaced state a customer could reach Continue having booked their
 * laundry to the shop's doorstep.
 *
 * The map is not the only way to place a pin — the address field above it has
 * Places Autocomplete and a labelled, keyboard-reachable input, which is the
 * accessible path. Everything the map adds is an accelerator on top of it.
 */
export function MapPicker({
  center,
  value,
  onChange,
  onAddressResolved,
  inputRef,
  maxRadiusKm,
  zone,
  checking,
  disabled = false,
  className,
}: MapPickerProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<google.maps.Map | null>(null);
  const ringRef = React.useRef<google.maps.Circle | null>(null);
  const removeStorePinRef = React.useRef<(() => void) | null>(null);
  const geocoderRef = React.useRef<google.maps.Geocoder | null>(null);
  const autocompleteRef = React.useRef<google.maps.places.Autocomplete | null>(
    null,
  );

  const onChangeRef = React.useRef(onChange);
  const onAddressRef = React.useRef(onAddressResolved);
  /** The last position handed to the wizard, so the map's own echo is ignored. */
  const lastEmittedRef = React.useRef<LatLng | null>(null);
  /** Where the map opened, so a tap that moved nothing does not place a pin. */
  const openingCentreRef = React.useRef<LatLng | null>(null);
  /** Set the moment the customer touches the map at all. */
  const touchedRef = React.useRef(false);

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

  /** Turn a coordinate into an address, without failing the coordinate itself. */
  function geocodePosition(position: LatLng): void {
    try {
      const geocoder = (geocoderRef.current ??=
        new window.google.maps.Geocoder());
      geocoder
        .geocode({ location: position })
        .then(({ results }) => {
          const address = results?.[0]?.formatted_address;
          if (address) onAddressRef.current(address);
        })
        .catch(() => {
          // Reverse geocoding is a nicety; the coordinates still stand.
        });
    } catch {
      // The Maps API never loaded, so there is nothing to geocode with. The
      // coordinates still stand, and the server still checks them.
    }
  }

  /** Hand a position to the wizard exactly once. */
  function emit(position: LatLng): void {
    lastEmittedRef.current = position;
    onChangeRef.current(position);
  }

  /**
   * Move the map somewhere we chose rather than somewhere the customer dragged,
   * recording where it is headed so the `idle` that follows reads as "already
   * reported" instead of a fresh placement.
   */
  function jumpTo(position: LatLng): void {
    lastEmittedRef.current = position;
    mapRef.current?.panTo(position);
  }

  /** The map settled. If the customer moved it, this is their pickup point. */
  function handleMapIdle(): void {
    const map = mapRef.current;
    if (!map || !touchedRef.current) return;

    const current = map.getCenter();
    if (!current) return;
    const position = { lat: current.lat(), lng: current.lng() };

    // Compared against wherever we last placed the map, falling back to where it
    // opened. That fallback is what stops a tap — which moves nothing — from
    // quietly booking the customer to the store.
    const reference = lastEmittedRef.current ?? openingCentreRef.current;
    if (reference && centreAt(map, reference)) return;

    emit(position);
    geocodePosition(position);
  }

  React.useEffect(() => {
    let cancelled = false;

    if (!hasKey || !containerRef.current) {
      setStatus("error");
      return;
    }

    const container = containerRef.current;

    function addStorePin(map: google.maps.Map): void {
      const mapId = googleMapsMapId();

      if (mapId && window.google.maps.marker?.AdvancedMarkerElement) {
        const pin = new window.google.maps.marker.PinElement({
          background: MAP_COLOURS.within.stroke,
          borderColor: "#14532d",
          glyphColor: "#ffffff",
          scale: 1.05,
        });
        const marker = new window.google.maps.marker.AdvancedMarkerElement({
          map,
          position: center,
          content: pin,
          title: "UClean store",
        });
        removeStorePinRef.current = () => {
          marker.map = null;
        };
        return;
      }

      const marker = new window.google.maps.Marker({
        map,
        position: center,
        title: "UClean store",
        opacity: 0.6,
      });
      removeStorePinRef.current = () => {
        marker.setMap(null);
      };
    }

    loadGoogleMaps()
      .then(() => {
        if (cancelled || !container) return;

        const openingCentre = value ?? center;
        const map = new window.google.maps.Map(container, {
          center: openingCentre,
          zoom: 14,
          mapId: googleMapsMapId() ?? undefined,
          disableDefaultUI: true,
          zoomControl: true,
          // Pinned to a corner so the locate button cannot land on top of it.
          zoomControlOptions: {
            position: window.google.maps.ControlPosition.RIGHT_BOTTOM,
          },
          clickableIcons: false,
          // "greedy" so panning the map does not also scroll the page behind it.
          gestureHandling: "greedy",
        });
        mapRef.current = map;
        openingCentreRef.current = openingCentre;

        addStorePin(map);

        ringRef.current = new window.google.maps.Circle({
          map,
          center,
          radius: maxRadiusKm * 1000,
          fillColor: MAP_COLOURS.neutral.fill,
          fillOpacity: 0.12,
          strokeColor: MAP_COLOURS.neutral.stroke,
          strokeOpacity: 0.65,
          strokeWeight: 1.5,
          clickable: false,
          zIndex: 1,
        });

        // Google only exposes "the map settled" as a named event, and which
        // drag/keyboard events it reports varies. Watching the container itself
        // keeps "the customer has interacted" true regardless.
        const markTouched = () => {
          touchedRef.current = true;
        };
        container.addEventListener("pointerdown", markTouched);
        container.addEventListener("keydown", markTouched);
        map.addListener("idle", handleMapIdle);

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
            touchedRef.current = true;
            jumpTo(position);
            emit(position);
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
      removeStorePinRef.current?.();
      removeStorePinRef.current = null;
      ringRef.current?.setMap(null);
      ringRef.current = null;
      mapRef.current = null;
      // The address input outlives the map, so the widget has to let go of it
      // or a remount leaves two listeners fighting over one field.
      autocompleteRef.current?.unbindAll();
      autocompleteRef.current = null;
    };
    // Intentionally initialised once; later value changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasKey]);

  // A position chosen elsewhere — autocomplete, current location, a reset —
  // arrives as a new `value`, so bring the map to it. When the customer panned
  // the map themselves the value already matches the centre, so this is a no-op
  // and there is no pan/emit loop.
  React.useEffect(() => {
    if (status !== "ready" || !value) return;
    const map = mapRef.current;
    if (!map) return;
    if (centreAt(map, value)) return;
    jumpTo(value);
  }, [status, value]);

  // Retint the ring as the verdict lands. The ring is a straight-line guide;
  // the chip is the server's driving-distance verdict, and that one is
  // authoritative when the two disagree near the edge of the zone.
  React.useEffect(() => {
    const tone = MAP_COLOURS[zoneTone(zone)];
    ringRef.current?.setOptions({
      fillColor: tone.fill,
      strokeColor: tone.stroke,
    });
  }, [zone]);

  React.useEffect(() => {
    ringRef.current?.setRadius(maxRadiusKm * 1000);
  }, [maxRadiusKm]);

  function useCurrentLocation(): void {
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

        touchedRef.current = true;
        jumpTo(next);
        emit(next);
        geocodePosition(next);
      },
      () => {
        setLocating(false);
        setGeoError("We could not read your location. Drag the map instead.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  const pinState: PinState = !value
    ? "unplaced"
    : checking
      ? "checking"
      : zone?.status === "outside"
        ? "outside"
        : "placed";

  const chip = renderChip(zone, checking);
  const chipTone = chipToneClass(zone, checking);

  return (
    <div className="space-y-2">
      <div
        className={cn(
          "relative overflow-hidden rounded-xl border border-[var(--border)]",
          className,
        )}
      >
        {status === "error" ? (
          <div className="bg-muted/40 text-muted-foreground flex h-56 flex-col items-center justify-center gap-2 px-6 text-center text-sm sm:h-72">
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
          <>
            <div
              ref={containerRef}
              role="region"
              aria-label="Pickup location. Pan the map until the pin sits on your address."
              className={cn(
                "h-56 w-full sm:h-72",
                disabled && "pointer-events-none opacity-70",
              )}
            />

            <CentrePin state={pinState} />

            {chip ? (
              <div className="absolute inset-x-3 bottom-3 flex justify-start">
                <span
                  // The same verdict is announced once, as text, by the step.
                  aria-hidden="true"
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium shadow-sm backdrop-blur-sm",
                    chipTone,
                  )}
                >
                  {chip}
                </span>
              </div>
            ) : null}
          </>
        )}

        {status === "loading" ? (
          <div className="bg-background/70 absolute inset-0 flex items-center justify-center">
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            <span className="sr-only">Loading the map</span>
          </div>
        ) : null}

        {/* Outside the map/error branches on purpose: geo-location needs no
            Google API to produce coordinates, and the server measures those
            itself. Keeping it here means a customer whose map failed can still
            complete a booking instead of hitting a dead end. */}
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={useCurrentLocation}
          disabled={disabled || locating || status === "loading"}
          title="Use my current location"
          aria-label="Use my current location"
          className="bg-background/95 absolute top-3 right-3 size-11 rounded-full shadow-md backdrop-blur-sm"
        >
          {locating ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <LocateFixed aria-hidden="true" />
          )}
        </Button>
      </div>

      {geoError ? (
        <p role="alert" className="text-sm text-[var(--destructive)]">
          {geoError}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The pin the customer is placing. It never moves; the map moves under it.
 *
 * Hollow and grey until a point has actually been chosen, so "you have not set
 * this yet" is something the customer can see rather than something they have
 * to infer from a form that looks finished.
 */
function CentrePin({ state }: { state: PinState }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[92%]"
    >
      <MapPin
        fill="var(--card)"
        strokeWidth={2}
        className={cn(
          "size-9 drop-shadow-md transition-colors",
          state === "unplaced" && "text-[var(--muted-foreground)]",
          state === "outside" && "text-amber-500",
          (state === "placed" || state === "checking") &&
            "text-[var(--primary)]",
        )}
      />
      <span
        className={cn(
          "absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full",
          state === "unplaced" && "bg-[var(--muted-foreground)]",
          state === "outside" && "bg-amber-500",
          (state === "placed" || state === "checking") && "bg-[var(--primary)]",
        )}
      />
    </div>
  );
}

/** The compact verdict that sits on the map. */
function renderChip(zone: ZoneResult | null, checking: boolean) {
  if (checking) {
    return (
      <>
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        Checking your distance...
      </>
    );
  }

  if (!zone) return null;

  if (zone.status === "within") {
    return (
      <>
        <CheckCircle2 className="size-3.5" aria-hidden="true" />
        {zone.distanceKm.toFixed(1)} km away - inside our area
      </>
    );
  }

  if (zone.status === "outside") {
    return (
      <>
        <XCircle className="size-3.5" aria-hidden="true" />
        {zone.distanceKm.toFixed(1)} km - outside our {zone.maxRadiusKm} km area
      </>
    );
  }

  if (zone.status === "unconfigured") {
    return (
      <>
        <AlertTriangle className="size-3.5" aria-hidden="true" />
        Service area not set up yet
      </>
    );
  }

  return (
    <>
      <AlertTriangle className="size-3.5" aria-hidden="true" />
      Could not check this address
    </>
  );
}

function chipToneClass(zone: ZoneResult | null, checking: boolean) {
  if (checking) {
    return "border-[var(--border)] bg-background/90 text-muted-foreground";
  }
  if (zone?.status === "within") {
    return "border-emerald-300 bg-emerald-50/90 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/90 dark:text-emerald-100";
  }
  if (zone?.status === "outside" || zone?.status === "unconfigured") {
    return "border-amber-300 bg-amber-50/90 text-amber-950 dark:border-amber-800 dark:bg-amber-950/90 dark:text-amber-100";
  }
  if (zone?.status === "error") {
    return "border-[var(--destructive)]/40 bg-background/90 text-[var(--destructive)]";
  }
  return "border-[var(--border)] bg-background/90 text-muted-foreground";
}
