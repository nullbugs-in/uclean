import type { Metadata } from "next";

import { PanelPage } from "@/components/panel/panel-page";
import { listPickupAgents } from "@/db/queries/admin-pickups";
import { createClient } from "@/db/server";
import { requireAdmin } from "@/server/auth";

import { AgentDirectory } from "../../_components/agent-directory";

export const metadata: Metadata = { title: "Staff" };

/**
 * Delivery-agent management: the Staff module is exclusively for the agents
 * who pick up orders.
 *
 * The roster is the pool the assignment dropdowns draw from (Pickups,
 * Deliveries, auto-assign), and it is the only place an account can be
 * *created*: `createAgent` runs the auth API, and a profile row is built by the
 * `on_auth_user_created` trigger, so there is no way to make one from an edit
 * form.
 *
 * Access control per agent: on/off duty feeds `is_available` in the
 * dispatch pool, and the active toggle writes `profiles.is_active`, which
 * blocks panel sign-in outright. Those columns need the service role to write:
 * migration 09 revoked `update on profiles` from `authenticated` so that no
 * signed-in customer could grant themselves a role. So `requireAdmin()` in the
 * actions is the only gate, and there is no policy behind it.
 */
export default async function AdminAgentsPage() {
  await requireAdmin();
  const supabase = await createClient();

  const agents = await listPickupAgents(supabase).catch((error: unknown) => {
    console.error("Could not load the agent roster", error);
    return [];
  });

  return (
    <PanelPage
      title="Staff"
      description="Manage delivery agents: add accounts, set duty, and control panel access."
    >
      <AgentDirectory agents={agents} />
    </PanelPage>
  );
}
