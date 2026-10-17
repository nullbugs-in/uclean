import type { Metadata } from "next";

import { PanelPage } from "@/components/panel/panel-page";
import { listActiveServices } from "@/db/queries/catalog";
import { listBillableOrders, listInvoices } from "@/db/queries/billing";
import { createClient } from "@/db/server";

import { BillingPanel } from "./billing-panel";

export const metadata: Metadata = { title: "Billing" };

/**
 * Billing (section 8.4 and 8.5).
 *
 * The item entry prices from the `services` catalogue rather than a typed rate:
 * a line names a service and the server reads its price, so the figure the
 * customer is billed cannot disagree with the price list. The page then shows
 * the invoices and lets an admin send one, or record the cash on delivery.
 *
 * Three reads, each falling back to an empty list so a single failure still
 * renders the rest of the page rather than dropping to an error boundary.
 */
export default async function AdminBillingPage() {
  const supabase = await createClient();

  const [invoices, billableOrders, services] = await Promise.all([
    listInvoices(supabase).catch(() => []),
    listBillableOrders(supabase).catch(() => []),
    listActiveServices(supabase).catch(() => []),
  ]);

  return (
    <PanelPage
      title="Billing"
      description="Record items from the price list, generate invoices, and take payment."
    >
      <BillingPanel
        invoices={invoices}
        billableOrders={billableOrders}
        services={services}
      />
    </PanelPage>
  );
}
