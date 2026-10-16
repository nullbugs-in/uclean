import type { Metadata } from "next";

import { PanelPage } from "@/components/panel/panel-page";
import { createClient } from "@/db/server";
import {
  getCustomerSummary,
  listAdminCustomers,
  readCustomerFilter,
} from "@/db/queries/admin-customers";
import { requireAdmin } from "@/server/auth";

import { AdminCustomerList } from "../../_components/admin-customer-list";
import { CustomerSummaryCards } from "../../_components/customer-summary-cards";

export const metadata: Metadata = { title: "Customers" };

/**
 * Customer list (architecture doc, section 7.2.2): "profile details, order
 * history, auto-saved on sign up".
 *
 * Sign up creates the profile through a database trigger, so there is no import
 * step and nothing to reconcile — every account ever created is here, including
 * walk-ins an admin made for someone who visited the store.
 *
 * Replaces a page that rendered a four-column read-only table capped at fifty
 * rows. It still advertised itself as unfinished, because it passed a
 * `milestone` prop to `PagePlaceholder`; this uses `PanelPage`, which is what
 * finished screens use, so the "Scaffolded, not yet implemented" strip is gone.
 *
 * The summary and the list are separate reads on purpose. The figures count
 * every customer in the business; the list answers whatever the admin has
 * narrowed to. Deriving one from the other would make the headline numbers
 * change the moment somebody searched a name.
 */
export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();

  const filter = readCustomerFilter(await searchParams);
  const supabase = await createClient();

  const [summary, result] = await Promise.all([
    // The figures are a nicety; the list is the page. A failed count must not
    // take the page with it, so it settles to zeroes rather than throwing.
    getCustomerSummary(supabase).catch((error: unknown) => {
      console.error("Could not load the customer summary", error);
      return { total: 0, newThisMonth: 0, newThisWeek: 0 };
    }),
    listAdminCustomers(supabase, filter).catch((error: unknown) => {
      console.error("Could not load customers", error);
      return {
        rows: [],
        total: 0,
        page: 1,
        pageCount: 1,
        hasPrevious: false,
        hasNext: false,
      };
    }),
  ]);

  return (
    <PanelPage
      title="Customers"
      description="Everyone who has signed up, with the bookings they have placed."
    >
      <div className="space-y-6">
        <CustomerSummaryCards summary={summary} />

        <AdminCustomerList result={result} filter={filter} />
      </div>
    </PanelPage>
  );
}
