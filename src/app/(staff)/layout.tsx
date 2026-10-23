import type { Metadata } from "next";

import {
  PanelShell,
  type PanelNavSection,
} from "@/components/panel/panel-shell";
import type { StaffBellNotifications } from "@/components/panel/staff-notifications-bell";
import { createClient } from "@/db/server";
import { listStaffNotifications } from "@/db/queries/staff-notifications";
import { requireRoleOrRedirect } from "@/server/auth";

export const metadata: Metadata = { title: "Staff" };

const SECTIONS: PanelNavSection[] = [
  {
    title: "Today",
    items: [
      { href: "/staff", label: "Overview" },
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
 *
 * The bell data is loaded here (the topbar is rendered by every staff page) so
 * a notification is never one click away from where the work happens. A query
 * failure falls back to an empty bell rather than taking the whole panel down,
 * exactly like the customer navbar's bell data in the public layout: a
 * notification bell is chrome, and chrome must not block the work.
 */
export default async function StaffLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await requireRoleOrRedirect(["staff", "admin"], "/staff");

  let notifications: StaffBellNotifications = { unread: 0, items: [] };
  try {
    notifications = await listStaffNotifications(
      await createClient(),
      session.profile.id,
    );
  } catch (error) {
    console.error("Could not load staff notifications", error);
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <PanelShell
        panelName="Staff"
        sections={SECTIONS}
        user={{
          full_name: session.profile.full_name,
          role: session.profile.role,
        }}
        notifications={notifications}
      >
        {children}
      </PanelShell>
    </div>
  );
}
