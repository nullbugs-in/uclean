import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { getStoreSettings } from "@/db/queries/catalog";
import { createClient } from "@/db/server";

export async function StoreSettingsPanel() {
  const supabase = await createClient();
  const store = await getStoreSettings(supabase).catch(() => null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Store</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="lat">Latitude</Label>
            <Input
              id="lat"
              name="lat"
              type="number"
              step="any"
              defaultValue={store?.lat ?? ""}
              placeholder="Not set"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lng">Longitude</Label>
            <Input
              id="lng"
              name="lng"
              type="number"
              step="any"
              defaultValue={store?.lng ?? ""}
              placeholder="Not set"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="address">Address</Label>
          <Input
            id="address"
            name="address"
            defaultValue={store?.address ?? ""}
            placeholder="Store address shown on the public site"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="max_radius_km">Max radius (km)</Label>
            <Input
              id="max_radius_km"
              name="max_radius_km"
              type="number"
              step="0.1"
              defaultValue={store?.max_radius_km ?? 6}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="whatsapp_number">WhatsApp number</Label>
            <Input
              id="whatsapp_number"
              name="whatsapp_number"
              defaultValue={store?.whatsapp_number ?? ""}
              placeholder="+91..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gstin">GSTIN</Label>
            <Input
              id="gstin"
              name="gstin"
              defaultValue={store?.gstin ?? ""}
              placeholder="Optional"
            />
          </div>
        </div>

        {store?.lat === null || store?.lng === null ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
            Coordinates are not set. Until they are, every pickup attempt
            returns &ldquo;the store location is not configured yet&rdquo;
            rather than checking against a guess.
          </p>
        ) : null}

        <p className="text-xs text-[var(--muted-foreground)]">
          Saving writes to store_settings, which the public Contact section
          reads for address, hours and the WhatsApp button. The save action
          lands with Milestone 4; every write to this table should also append
          an audit_logs row.
        </p>
      </CardContent>
    </Card>
  );
}
