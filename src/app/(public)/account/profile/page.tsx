import type { Metadata } from "next";

import { AddressManager } from "@/components/account/address-manager";
import { initialsOf } from "@/components/account/glass";
import { ProfileDetailsSection } from "@/components/account/profile-details-form";
import { listAddresses } from "@/db/queries/profiles";
import { createClient } from "@/db/server";
import { formatDate, formatDateTime } from "@/lib/utils";
import { requireRoleOrRedirect } from "@/server/auth";

export const metadata: Metadata = { title: "Profile" };

/**
 * Profile page (section 6.1).
 *
 * Name and mobile are edited in exactly one place. Every other screen reads
 * them from here by user id, which is why an edit here shows up on the booking
 * form and notifications immediately.
 *
 * The details card swaps between a read view and an edit form; both live in
 * `ProfileDetailsSection` so this page stays a server component.
 */
export default async function ProfilePage() {
  const session = await requireRoleOrRedirect(
    ["customer", "staff", "admin"],
    "/account/profile",
  );
  const supabase = await createClient();
  const addresses = await listAddresses(supabase, session.profile.id).catch(
    () => [],
  );

  const { profile } = session;

  return (
    <div className="space-y-8">
      <header className="uc-fade-up flex flex-wrap items-center gap-4">
        <span
          aria-hidden="true"
          className="grid size-16 shrink-0 place-items-center rounded-full bg-[color-mix(in_oklab,var(--uc-lime-500),transparent_65%)] text-xl font-bold text-[var(--uc-green-900)] ring-4 ring-[color-mix(in_oklab,var(--uc-lime-500),transparent_75%)]"
        >
          {initialsOf(profile.full_name)}
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {profile.full_name}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Customer since {formatDate(profile.created_at)}
          </p>
        </div>
      </header>

      <section aria-labelledby="details-heading" className="space-y-4">
        <h2 id="details-heading" className="font-display text-lg font-semibold">
          Details
        </h2>

        <ProfileDetailsSection profile={profile} />
      </section>

      <section aria-labelledby="addresses-heading" className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2
            id="addresses-heading"
            className="font-display text-lg font-semibold"
          >
            Saved addresses
          </h2>
          <p className="text-muted-foreground text-sm">
            {addresses.length} saved
          </p>
        </div>

        {/*
         * Editable rather than read-only. The only way to change what is
         * prefilled at booking time used to be completing another booking, which
         * is a poor way to fix a typo and impossible for someone who has moved
         * and does not want to book yet.
         *
         * The per-card animation delays are gone with the cards; the manager
         * renders its own layout and the stagger was cosmetic.
         *
         * Note what is not here: a distance from the store. `distance_km` is
         * never populated, because the address step does no location work yet,
         * so the branch that would have shown it could never run. It comes back
         * when geocoding does.
         */}
        <AddressManager addresses={addresses} />
      </section>

      <p className="text-muted-foreground text-xs">
        Last updated {formatDateTime(profile.updated_at ?? profile.created_at)}.
      </p>
    </div>
  );
}
