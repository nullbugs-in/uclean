import type { Metadata } from "next";

import {
  PanelShell,
  type PanelNavSection,
} from "@/components/panel/panel-shell";
import { requireRoleOrRedirect } from "@/server/auth";

export const metadata: Metadata = { title: "Staff" };

const SECTIONS: PanelNavSection[] = [
  {
    title: "Today",
    items: [
      { href: "/staff/pickups", label: "My pickups" },
      { href: "/staff/deliveries", label: "My deliveries" },
    ],
  },
  {
    title: "Orders",
    items: [
      { href: "/staff/orders", label: "Orders" },
      { href: "/staff/bills", label: "Bills" },
    ],
  },
];

/**
 * Staff panel layout.
 *
 * Staff see only the orders they hold an assignment against, or all of them if
 * profiles.can_view_all_orders is set. That filtering is enforced by RLS, not
 * by this layout, so a mistake here cannot leak the order book.
 */
export default async function StaffLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await requireRoleOrRedirect(
    ["staff", "admin"],
    "/staff/pickups",
  );

  return (
    <div className="flex min-h-dvh flex-col">
      <PanelShell
        panelName="Staff"
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
