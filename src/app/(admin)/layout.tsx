import type { Metadata } from "next";

import {
  PanelShell,
  type PanelNavSection,
} from "@/components/panel/panel-shell";
import { requireRoleOrRedirect } from "@/server/auth";

export const metadata: Metadata = { title: "Admin" };

const SECTIONS: PanelNavSection[] = [
  {
    title: "Overview",
    items: [
      { href: "/admin", label: "Dashboard" },
      { href: "/admin/sales", label: "Sales reports" },
    ],
  },
  {
    title: "Operations",
    items: [
      { href: "/admin/pickups", label: "Pickups" },
      { href: "/admin/bookings", label: "Bookings" },
      { href: "/admin/deliveries", label: "Deliveries" },
      { href: "/admin/walk-in", label: "Walk-ins" },
    ],
  },
  {
    title: "People",
    items: [
      { href: "/admin/customers", label: "Customers" },
      { href: "/admin/agents", label: "Staff and agents" },
    ],
  },
  {
    title: "Money",
    items: [
      { href: "/admin/billing", label: "Billing" },
      { href: "/admin/notifications", label: "Notifications" },
    ],
  },
  {
    title: "Configuration",
    items: [
      { href: "/admin/services", label: "Services and prices" },
      { href: "/admin/slots", label: "Time slots" },
      { href: "/admin/settings", label: "Settings" },
    ],
  },
];

/**
 * Admin panel layout.
 *
 * Only the admin role reaches here. The middleware redirect is the fast filter;
 * this layout calls requireRoleOrRedirect as well, which is the check that
 * actually matters.
 */
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await requireRoleOrRedirect(["admin"], "/admin");

  return (
    <div className="flex min-h-dvh flex-col">
      <PanelShell
        panelName="Admin"
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
