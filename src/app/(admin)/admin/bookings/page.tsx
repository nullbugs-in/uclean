import type { Metadata } from "next";

import { PanelPage } from "@/components/panel/panel-page";
import { createClient } from "@/db/server";
import {
  getBookingSummary,
  listAdminOrders,
  readBookingFilter,
} from "@/db/queries/admin-orders";
import { requireAdmin } from "@/server/auth";

import { AdminOrderList } from "../../_components/admin-order-list";
import { BookingSummaryCards } from "../../_components/booking-summary-cards";

export const metadata: Metadata = { title: "Bookings" };

/**
 * Admin bookings (architecture doc, section 7.2.4).
 *
 * "Bookings" rather than "Orders" because that is the word the customer is given
 * on their own page. The doc still calls this Orders, and so does the staff
 * panel, so the database table and every shared helper keep the `order` name.
 *
 * Replaces a page that rendered the staff pickup list with `type="pickup"`, so
 * delivery-leg bookings and anything delivered or cancelled were invisible, and
 * which reached across route groups into a staff-owned component to do it.
 *
 * The list and the summary are separate reads on purpose. The figures count
 * every booking in the business; the list answers whatever the admin has
 * narrowed to. Deriving one from the other would make the headline numbers change
 * every time somebody searched for a customer.
 */
export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();

  const filter = readBookingFilter(await searchParams);
  const supabase = await createClient();

  const [summary, result] = await Promise.all([
    /*
     * The figures are a nicety; the list is the page. A failed count must not
     * take the page with it, so it settles to zeroes rather than throwing.
     */
    getBookingSummary(supabase).catch((error: unknown) => {
      console.error("Could not load the bookings summary", error);
      return {
        total: 0,
        awaitingPickup: 0,
        inProgress: 0,
        readyForDelivery: 0,
        delivered: 0,
        open: 0,
      };
    }),
    listAdminOrders(supabase, filter).catch((error: unknown) => {
      console.error("Could not load admin bookings", error);
      return {
        rows: [],
        total: 0,
        page: 1,
        pageCount: 1,
        hasPrevious: false,
        hasNext: false,
        truncated: false,
      };
    }),
  ]);

  return (
    <PanelPage
      title="Bookings"
      description="Every booking a customer has placed, in any state."
    >
      <div className="space-y-6">
        <BookingSummaryCards summary={summary} />

        <AdminOrderList result={result} filter={filter} />
      </div>
    </PanelPage>
  );
}
