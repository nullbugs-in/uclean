import type { Metadata } from "next";
import { Home, Mail, MessageCircle, Phone, UserRound } from "lucide-react";

import { GlassCard, initialsOf } from "@/components/account/glass";
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

        <GlassCard className="uc-fade-up" style={{ animationDelay: "60ms" }}>
          <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
            <Detail
              icon={<UserRound className="size-4" aria-hidden="true" />}
              label="Full name"
              value={profile.full_name}
            />
            <Detail
              icon={<Phone className="size-4" aria-hidden="true" />}
              label="Mobile"
              value={profile.mobile}
            />
            <Detail
              icon={<MessageCircle className="size-4" aria-hidden="true" />}
              label="WhatsApp"
              value={profile.whatsapp_number ?? "Not set"}
              muted={!profile.whatsapp_number}
            />
            <Detail
              icon={<Mail className="size-4" aria-hidden="true" />}
              label="Email"
              value={profile.email ?? "Not set"}
              muted={!profile.email}
            />
          </dl>
        </GlassCard>
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

        {addresses.length === 0 ? (
          <GlassCard
            className="uc-fade-up text-center"
            style={{ animationDelay: "120ms" }}
          >
            <Home
              className="mx-auto mb-3 size-7 text-[var(--uc-lime-600)]"
              aria-hidden="true"
            />
            <p className="font-medium">No saved addresses</p>
            <p className="text-muted-foreground mt-1 text-sm">
              The pickup address you confirm while booking is saved here
              automatically, so you never have to type it twice.
            </p>
          </GlassCard>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {addresses.map((address, index) => (
              <li key={address.id}>
                <GlassCard
                  hover
                  className="uc-fade-up h-full"
                  style={{ animationDelay: `${120 + index * 60}ms` }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium">
                      {address.label}
                      {address.is_default ? (
                        <span className="ml-2 rounded-full bg-[color-mix(in_oklab,var(--uc-lime-500),transparent_75%)] px-2 py-0.5 text-xs font-semibold text-[var(--uc-green-800)]">
                          Default
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <p className="text-muted-foreground mt-2 flex items-start gap-2 text-sm">
                    <Home
                      className="mt-0.5 size-4 shrink-0"
                      aria-hidden="true"
                    />
                    <span>{address.address_text}</span>
                  </p>
                  {address.distance_km !== null ? (
                    <p className="text-muted-foreground mt-2 text-xs">
                      {address.distance_km} km from the store
                    </p>
                  ) : null}
                </GlassCard>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-muted-foreground text-xs">
        Last updated {formatDateTime(profile.updated_at ?? profile.created_at)}.
      </p>
    </div>
  );
}

function Detail({
  icon,
  label,
  value,
  muted = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-[color-mix(in_oklab,var(--uc-lime-500),transparent_78%)] text-[var(--uc-green-800)]"
      >
        {icon}
      </span>
      <div className="min-w-0">
        <dt className="text-muted-foreground text-xs tracking-wide uppercase">
          {label}
        </dt>
        <dd
          className={
            muted ? "text-muted-foreground text-sm" : "truncate font-medium"
          }
        >
          {value}
        </dd>
      </div>
    </div>
  );
}
