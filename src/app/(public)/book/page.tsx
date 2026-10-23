import type { Metadata } from "next";

import { getStoreSettings } from "@/db/queries/catalog";
import { readPricingCatalog } from "@/db/queries/pricing";
import { listAddresses } from "@/db/queries/profiles";
import { createClient } from "@/db/server";
import { siteConfig } from "@/config/site";
import { getSessionUser } from "@/server/auth";
import { devOtpCode } from "@/server/otp";

import { BookWizard } from "./book-wizard";

export const metadata: Metadata = {
  title: "Book a Pickup",
  description:
    "Book a laundry pickup in four steps: verify your mobile number, enter your pickup address, choose a slot, and confirm.",
};

export default async function BookPage() {
  const session = await getSessionUser().catch(() => null);
  const supabase = await createClient();

  /**
   * The store point and radius come from `store_settings` when they are set,
   * falling back to the public config otherwise.
   *
   * This matters because the server measures the 6 km zone from
   * `store_settings`, so centering the map on anything else would show the
   * customer one reference point while judging them against another. The
   * coordinates are already public (the contact map pin and `siteConfig` carry
   * them), so serving them here does not widen what is exposed.
   */
  const store = await getStoreSettings(supabase).catch(() => null);

  const storeCenter =
    store && store.lat !== null && store.lng !== null
      ? { lat: store.lat, lng: store.lng }
      : siteConfig.coordinates;

  const maxRadiusKm = store?.max_radius_km ?? siteConfig.deliveryRadiusKm;

  /**
   * A returning customer should not have to retype the address they gave us
   * last time. `listAddresses` already orders defaults first, so the first row
   * is the one worth offering. A read failure is not worth failing the page
   * over: the wizard still works, the field just starts empty.
   */
  const savedAddress = session
    ? await listAddresses(supabase, session.profile.id)
        .then((addresses) => addresses[0]?.address_text ?? "")
        .catch(() => "")
    : "";

  /*
   * The services step books from this list, so an admin's price edit is live
   * for the next customer. A read failure cannot be papered over - the wizard
   * needs at least the group menu to render - so an error here falls to the
   * route's error boundary.
   */
  const regular = (await readPricingCatalog(supabase)).regular;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <header className="mb-8 space-y-3">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Book a Pickup
        </h1>
        <p className="text-muted-foreground text-lg">
          {session
            ? "Confirm where we should collect from and pick a slot."
            : "Verify your mobile number, tell us where to collect, and pick a time slot."}
        </p>
      </header>

      <BookWizard
        storeCenter={storeCenter}
        maxRadiusKm={maxRadiusKm}
        devTestCode={devOtpCode()}
        initialAddress={savedAddress}
        pricing={regular}
        initialIdentity={
          session
            ? {
                name: session.profile.full_name,
                mobile: session.profile.mobile,
              }
            : null
        }
      />
    </div>
  );
}
