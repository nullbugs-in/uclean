import { redirect } from "next/navigation";

/**
 * Moved to /admin/bookings.
 *
 * Kept as a redirect rather than deleted so an old bookmark, a pasted link, or
 * a browser back-button entry does not land on a 404. The admin module is
 * called "Bookings" to match what the customer is told on their own page.
 */
export default function AdminOrdersRedirect() {
  redirect("/admin/bookings");
}
