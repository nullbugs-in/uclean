import type { Metadata } from "next";

import {
  PanelShell,
  type PanelNavSection,
} from "@/components/panel/panel-shell";
import { requireRoleOrRedirect } from "@/server/auth";

export const metadata: Metadata = { title: "My Account" };

const SECTIONS: PanelNavSection[] = [
  {
    title: "Account",
    items: [
      // No dashboard row: /account forwards to the home page now that a booking
      // confirms on the site rather than inside a panel.
      { href: "/account/book", label: "Book a pickup" },
      { href: "/account/orders", label: "My orders" },
      { href: "/account/profile", label: "Profile" },
    ],
  },
];

/**
 * Customer panel layout.
 *
 * The layout is the first place the session is resolved, so no child page
 * renders before the role is known. `requireRoleOrRedirect` re-reads the role
 * from `profiles` rather than trusting a cookie claim.
 */
export default async function AccountLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await requireRoleOrRedirect(
    ["customer", "staff", "admin"],
    "/account",
  );

  return (
    <div className="flex min-h-dvh flex-col">
      <PanelShell
        panelName="My Account"
        sections={SECTIONS}
        user={{
          full_name: session.profile.full_name,
          role: session.profile.role,
        }}
      >
        {children}
      </PanelShell>
    </div>
  );
}
