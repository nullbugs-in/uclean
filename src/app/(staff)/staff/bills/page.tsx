import type { Metadata } from "next";

import { PanelPage } from "@/components/panel/panel-page";
import { listInvoices } from "@/db/queries/billing";
import { createClient } from "@/db/server";
import { requireRoleOrRedirect } from "@/server/auth";

import { StaffBillsPanel } from "./bills-panel";

export const metadata: Metadata = { title: "Bills" };

/**
 * Bill view for staff (section 10).
 *
 * The list is scoped by RLS: an agent sees the bills on orders they are assigned
 * against, store staff see all of them. A staff member can record that the cash
 * was collected on delivery and cannot create or change a bill - `payments` has
 * an insert policy for assigned staff, `invoices` has none.
 *
 * Reads fall back to an empty list, so a failure shows an empty table rather than
 * dropping the panel to an error boundary.
 */
export default async function StaffBillsPage() {
  await requireRoleOrRedirect(["staff", "admin"], "/staff/bills");

  const supabase = await createClient();
  const invoices = await listInvoices(supabase).catch(() => []);

  return (
    <PanelPage
      title="Bills"
      description="Invoices for the orders you handle, and the cash you collect on delivery."
    >
      <StaffBillsPanel invoices={invoices} />
    </PanelPage>
  );
}
