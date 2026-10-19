import type { Metadata } from "next";

import { PanelPage } from "@/components/panel/panel-page";
import { PanelProfile } from "@/components/panel/panel-profile";
import { requireRoleOrRedirect } from "@/server/auth";

export const metadata: Metadata = { title: "My account" };

/**
 * The staff member's own account, inside the staff panel.
 *
 * `requireRoleOrRedirect` returns the profile row it already read to check the
 * role, so this needs no second query and no new data path - the card renders
 * from the same session every other staff screen trusts.
 *
 * The guard runs again here even though `(staff)/layout.tsx` has already checked
 * it. That is the established pattern across the panel (see `bills/page.tsx`):
 * the layout is a fast filter, and the page is the check that actually matters.
 */
export default async function StaffProfilePage() {
  const session = await requireRoleOrRedirect(
    ["staff", "admin"],
    "/staff/profile",
  );

  return (
    <PanelPage
      title="My account"
      description="Your own details and what they let you see in this panel."
    >
      <PanelProfile profile={session.profile} />
    </PanelPage>
  );
}
