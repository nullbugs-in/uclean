"use client";

import { Loader2, Save } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import type { StoreSettings } from "@/db/types";

import { saveStoreSettingsAction } from "./actions";

/**
 * The store settings form.
 *
 * Everything is submitted together rather than field by field: the coordinates
 * and the radius describe one place, and saving them piecemeal is how a store
 * ends up being measured from a point that is only half-updated.
 *
 * Blank number fields are sent as `null`, not `0`, so clearing a coordinate
 * means "unset" rather than "the Gulf of Guinea". The action re-validates every
 * value; parsing here is only so a typo gets an immediate, local complaint.
 */
export function StoreSettingsForm({ store }: { store: StoreSettings | null }) {
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>(
    {},
  );
  const [isPending, startTransition] = React.useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setFieldErrors({});

    const data = new FormData(event.currentTarget);

    const text = (name: string): string | null => {
      const raw = String(data.get(name) ?? "").trim();
      return raw === "" ? null : raw;
    };

    const number = (name: string): number | null => {
      const raw = text(name);
      if (raw === null) return null;
      const parsed = Number(raw);
      // NaN is passed through on purpose: the schema's `invalid_type_error` is
      // what turns it into a readable message about that field.
      return Number.isFinite(parsed) ? parsed : Number.NaN;
    };

    startTransition(async () => {
      const result = await saveStoreSettingsAction({
        lat: number("lat"),
        lng: number("lng"),
        maxRadiusKm: number("max_radius_km") ?? Number.NaN,
        address: text("address"),
        whatsappNumber: text("whatsapp_number"),
        gstin: text("gstin"),
      });

      if (!result.ok) {
        setError(result.message);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }

      setNotice(result.message);
    });
  }

  /** A field's error message, if the last submit produced one. */
  const fieldError = (name: string) =>
    fieldErrors[name] ? (
      <p className="text-destructive text-xs">{fieldErrors[name]}</p>
    ) : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="lat">Latitude</Label>
          <Input
            id="lat"
            name="lat"
            type="number"
            step="any"
            inputMode="decimal"
            defaultValue={store?.lat ?? ""}
            placeholder="Not set"
            aria-invalid={Boolean(fieldErrors.lat)}
          />
          {fieldError("lat")}
        </div>
        <div className="space-y-2">
          <Label htmlFor="lng">Longitude</Label>
          <Input
            id="lng"
            name="lng"
            type="number"
            step="any"
            inputMode="decimal"
            defaultValue={store?.lng ?? ""}
            placeholder="Not set"
            aria-invalid={Boolean(fieldErrors.lng)}
          />
          {fieldError("lng")}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="address">Address</Label>
        <Input
          id="address"
          name="address"
          defaultValue={store?.address ?? ""}
          placeholder="Store address shown on the public site"
          aria-invalid={Boolean(fieldErrors.address)}
        />
        {fieldError("address")}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="max_radius_km">Max radius (km)</Label>
          <Input
            id="max_radius_km"
            name="max_radius_km"
            type="number"
            step="0.1"
            inputMode="decimal"
            defaultValue={store?.max_radius_km ?? 6}
            aria-invalid={Boolean(fieldErrors.maxRadiusKm)}
          />
          {fieldError("maxRadiusKm")}
        </div>
        <div className="space-y-2">
          <Label htmlFor="whatsapp_number">WhatsApp number</Label>
          <Input
            id="whatsapp_number"
            name="whatsapp_number"
            defaultValue={store?.whatsapp_number ?? ""}
            placeholder="+91..."
            aria-invalid={Boolean(fieldErrors.whatsappNumber)}
          />
          {fieldError("whatsappNumber")}
        </div>
        <div className="space-y-2">
          <Label htmlFor="gstin">GSTIN</Label>
          <Input
            id="gstin"
            name="gstin"
            defaultValue={store?.gstin ?? ""}
            placeholder="Optional"
            aria-invalid={Boolean(fieldErrors.gstin)}
          />
          {fieldError("gstin")}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <Save aria-hidden="true" />
          )}
          Save settings
        </Button>

        {/* Feedback sits next to the button that produced it, like the rest of
            the admin panel, rather than in a toast that scrolls away. */}
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}

        {notice ? (
          <p className="text-muted-foreground text-sm" aria-live="polite">
            {notice}
          </p>
        ) : null}
      </div>
    </form>
  );
}
