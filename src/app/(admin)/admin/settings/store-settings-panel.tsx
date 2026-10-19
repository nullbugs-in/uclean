import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getStoreSettings } from "@/db/queries/catalog";
import { createClient } from "@/db/server";

import { StoreSettingsForm } from "./store-settings-form";

export async function StoreSettingsPanel() {
  const supabase = await createClient();
  const store = await getStoreSettings(supabase).catch(() => null);

  const coordinatesMissing = !store || store.lat === null || store.lng === null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Store</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <StoreSettingsForm store={store} />

        {coordinatesMissing ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
            Coordinates are not set. Until they are, every pickup attempt
            returns &ldquo;the store location is not configured yet&rdquo;
            rather than checking against a guess.
          </p>
        ) : null}

        <p className="text-xs text-[var(--muted-foreground)]">
          Saving writes to store_settings, which the public Contact section
          reads for address, hours and the WhatsApp button. The coordinates and
          the radius are what the server-side 6 km delivery check measures from.
          Every write appends an audit_logs row.
        </p>
      </CardContent>
    </Card>
  );
}
