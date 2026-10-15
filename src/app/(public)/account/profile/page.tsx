import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/placeholder";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listAddresses } from "@/db/queries/profiles";
import { createClient } from "@/db/server";
import { formatDateTime } from "@/lib/utils";
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

  return (
    <PagePlaceholder
      title="Profile"
      description="Your name, mobile number and saved addresses."
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <p>
            <span className="text-[var(--muted-foreground)]">Name: </span>
            {session.profile.full_name}
          </p>
          <p>
            <span className="text-[var(--muted-foreground)]">Mobile: </span>
            {session.profile.mobile}
          </p>
          <p>
            <span className="text-[var(--muted-foreground)]">WhatsApp: </span>
            {session.profile.whatsapp_number ?? "Not set"}
          </p>
          <p>
            <span className="text-[var(--muted-foreground)]">Email: </span>
            {session.profile.email ?? "Not set"}
          </p>
          <p className="sm:col-span-2">
            <span className="text-[var(--muted-foreground)]">
              Member since:{" "}
            </span>
            {formatDateTime(session.profile.created_at)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Saved addresses</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {addresses.length === 0 ? (
            <p className="text-[var(--muted-foreground)]">
              No saved addresses. Addresses are saved during booking.
            </p>
          ) : (
            addresses.map((address) => (
              <div
                key={address.id}
                className="rounded-md border border-[var(--border)] p-3"
              >
                <p className="font-medium">
                  {address.label}
                  {address.is_default ? " (default)" : ""}
                </p>
                <p className="text-[var(--muted-foreground)]">
                  {address.address_text}
                </p>
                {address.distance_km !== null ? (
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {address.distance_km} km from the store
                  </p>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </PagePlaceholder>
  );
}
