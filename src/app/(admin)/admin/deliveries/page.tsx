import type { Metadata } from "next";

import { PanelPage } from "@/components/panel/panel-page";
import {
  DELIVERY_FILTERS,
  listDeliveryRequests,
  type DeliveryFilter,
} from "@/db/queries/admin-deliveries";
import { listPickupAgents } from "@/db/queries/admin-pickups";
import { createClient } from "@/db/server";
import { requireAdmin } from "@/server/auth";

import { DeliveryQueue } from "../../_components/delivery-queue";

export const metadata: Metadata = { title: "Delivery management" };

function readFilter(value: string | string[] | undefined): DeliveryFilter {
  const candidate = Array.isArray(value) ? value[0] : value;
  return DELIVERY_FILTERS.includes(candidate as DeliveryFilter)
    ? (candidate as DeliveryFilter)
    : "all";
}

/**
 * Delivery management (section 8.8): "delivery assignment, status, proof of
 * delivery and Cash on Delivery records".
 *
 * Every row here is an order that is ready to go out or already on its way. The
 * previous version of this page rendered the staff assignment list - the same
 * mistake the pickup page made, and for the same reason: a list driven off
 * `pickup_assignments` shows the deliveries that already have an agent and hides
 * the ones that need one. This page reads `orders` first and joins the delivery
 * assignment on afterwards.
 *
 * Proof of delivery has no column and no screen in Phase 1; what stands in for
 * it is the order status moving to `delivered`, which the booking page records
 * against the acting staff member. The COD amount is shown here because a driver
 * reading this board needs the figure before they knock, and the invoice is the
 * only place it is kept.
 *
 * Writes go through the existing booking actions, which is where `requireAdmin()`
 * lives for them; this page is read-only apart from the assignment control.
 */
export default async function AdminDeliveriesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string | string[] }>;
}) {
  await requireAdmin();

  const { filter } = await searchParams;
  const supabase = await createClient();

  const [requests, agents] = await Promise.all([
    listDeliveryRequests(supabase),
    // A failed roster read must not blank the queue, so each is settled on its
    // own rather than together.
    listPickupAgents(supabase).catch((error: unknown) => {
      console.error("Could not load the agent roster", error);
      return [];
    }),
  ]);

  return (
    <PanelPage
      title="Delivery management"
      description="What is going out, who is carrying it, and the cash to collect."
    >
      <DeliveryQueue
        requests={requests}
        agents={agents}
        filter={readFilter(filter)}
      />
    </PanelPage>
  );
}
