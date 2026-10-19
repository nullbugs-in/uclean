import type { Metadata } from "next";

import { PanelPage } from "@/components/panel/panel-page";
import { PanelProfile } from "@/components/panel/panel-profile";
import { requireRoleOrRedirect } from "@/server/auth";

export const metadata: Metadata = { title: "My account" };

/**
 * The admin's own account, inside the admin panel.
 *
 * Same component and same source as the staff version, deliberately: an admin
 * and a staff member differ in what they can do, not in what their account
 * page should say. Keeping one card means a fix to either lands on both.
 *
 * Read-only, so this page cannot be used to escalate. An admin who edits their
 * own role from the screen that role unlocks has granted themselves nothing
 * they could not take through the users screen anyway, but has left no trace of
 * who did it.
 */
export default async function AdminProfilePage() {
  const session = await requireRoleOrRedirect(["admin"], "/admin/profile");

  return (
    <PanelPage
      title="My account"
      description="Your own details and what they let you see in this panel."
    >
      <PanelProfile profile={session.profile} />
    </PanelPage>
  );
}
