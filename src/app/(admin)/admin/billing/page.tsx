import type { Metadata } from "next";

import { PanelPage } from "@/components/panel/panel-page";
import { listInvoices } from "@/db/queries/billing";
import { readInvoiceStatusFilter } from "@/db/queries/billing.view";
import { createClient } from "@/db/server";

import { BillingPanel } from "./billing-panel";

export const metadata: Metadata = { title: "Billing" };

/**
 * Billing (section 8.4 and 8.5).
 *
 * The page shows the whole invoice history — every bill the store has raised,
 * at any stage. Invoices are generated from a booking card, so there is no
 * entry form here; Billing is the registry and the actions over what exists.
 *
 * The read falls back to an empty list so a failure still renders the page
 * rather than dropping to an error boundary. The fallback logs: a quiet empty
 * list and a broken one must stay distinguishable, or a missing history would
 * read as "nothing billed yet".
 */
export default async function AdminBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const { status } = await searchParams;
  const supabase = await createClient();

  const invoices = await listInvoices(supabase).catch((error: unknown) => {
    console.error("Could not load the invoice history", error);
    return [];
  });

  return (
    <PanelPage
      title="Billing"
      description="Record items from the price list, generate invoices, and take payment."
    >
      <BillingPanel
        invoices={invoices}
        statusFilter={readInvoiceStatusFilter(status)}
      />
    </PanelPage>
  );
}
