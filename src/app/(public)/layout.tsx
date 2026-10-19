import { Footer } from "@/components/layout/footer";
import { Navbar } from "@/components/layout/navbar";
import { WhatsAppFloat } from "@/components/layout/whatsapp-float";
import { listRecentNotifications } from "@/db/queries/notifications";
import { countCustomerOrders } from "@/db/queries/orders";
import { createClient } from "@/db/server";
import { getSessionUser } from "@/server/auth";

/**
 * The navbar shows a profile menu instead of Log in / Sign up, a My bookings
 * shortcut once the customer has booked, and a notification bell, so the
 * session has to be resolved here. That makes every public route dynamic, which
 * the previously static pricing pages now are.
 *
 * The two extra queries only run for a signed-in visitor; anonymous page views
 * cost nothing beyond the session check.
 *
 * Only the public site reads the session this way: the admin and staff panels
 * keep their own chrome and are unaffected.
 */
export default async function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSessionUser().catch(() => null);

  let hasBookings = false;
  let notifications: Awaited<ReturnType<typeof listRecentNotifications>> = {
    unread: 0,
    items: [],
  };

  if (session) {
    const supabase = await createClient();

    const [orders, recent] = await Promise.all([
      countCustomerOrders(supabase, session.profile.id).catch(() => 0),
      // An empty bell must mean "no messages", never "the query is broken".
      // Swallowing the error into an empty list made a missing column look
      // exactly like a quiet inbox, and the two were indistinguishable from the
      // outside - which is a slow way to find out the database was out of step
      // with the app.
      listRecentNotifications(supabase, session.profile.id).catch(
        (error: unknown) => {
          console.error("Could not load notifications", error);
          return { unread: 0, items: [] };
        },
      ),
    ]);

    hasBookings = orders > 0;
    notifications = recent;
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <Navbar
        user={
          session
            ? {
                fullName: session.profile.full_name,
                mobile: session.profile.mobile,
                role: session.profile.role,
                hasBookings,
                notifications,
              }
            : null
        }
      />
      <main className="flex-1">{children}</main>
      <Footer />
      <WhatsAppFloat />
    </div>
  );
}
