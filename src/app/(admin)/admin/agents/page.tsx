import type { Metadata } from "next";

import { PanelPage } from "@/components/panel/panel-page";
import { listPickupAgents } from "@/db/queries/admin-pickups";
import { listStaffAndAdmins } from "@/db/queries/profiles";
import { createClient } from "@/db/server";
import { requireAdmin } from "@/server/auth";

import { AgentDirectory } from "../../_components/agent-directory";
import { StaffAccounts } from "../../_components/staff-accounts";

export const metadata: Metadata = { title: "Staff and agents" };

/**
 * Staff and agent management (section 8.12): "Create staff accounts, set roles,
 * mark agents active, assign zones".
 *
 * Two lists, because they are two different things.
 *
 * The roster is the pool the assignment dropdown draws from, and it is the only
 * place an account can be *created*: `createAgent` runs the auth API, and a
 * profile row is built by the `on_auth_user_created` trigger, so there is no way
 * to make one from an edit form.
 *
 * Everything else about a staff account - whether they are a staff member, whether
 * they can sign in, whether they see the whole order book - is edited here against
 * `profiles`. Those three columns need the service role to write: migration 09
 * revoked `update on profiles` from `authenticated` so that no signed-in customer
 * could grant themselves a role. So `requireAdmin()` in the actions is the only
 * gate, and there is no policy behind it.
 *
 * Store-wide visibility is the boolean `profiles.can_view_all_orders`, not a
 * fourth role value; the policies read it through `is_store_staff()`.
 */
export default async function AdminAgentsPage() {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const [members, agents] = await Promise.all([
    listStaffAndAdmins(supabase),
    // A failed roster read must not blank the team list.
    listPickupAgents(supabase).catch((error: unknown) => {
      console.error("Could not load the agent roster", error);
      return [];
    }),
  ]);

  return (
    <PanelPage
      title="Staff and agents"
      description="Create staff accounts, set roles, mark agents active, assign zones."
    >
      <div className="space-y-6">
        <StaffAccounts members={members} currentUserId={admin.profile.id} />
        <AgentDirectory agents={agents} />
      </div>
    </PanelPage>
  );
}
