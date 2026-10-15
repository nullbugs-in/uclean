import { Footer } from "@/components/layout/footer";
import { Navbar } from "@/components/layout/navbar";
import { WhatsAppFloat } from "@/components/layout/whatsapp-float";
import { countCustomerOrders } from "@/db/queries/orders";
import { createClient } from "@/db/server";
import { getSessionUser } from "@/server/auth";

/**
 * The navbar shows a profile menu instead of Log in / Sign up, plus a "My
 * bookings" shortcut once the customer has booked, so the session has to be
 * resolved here. That makes every public route dynamic, which the previously
 * static pricing pages now are.
 *
 * The order count only runs for a signed-in visitor; anonymous page views cost
 * nothing beyond the session check.
 *
 * Only the public site reads the session this way. The admin and staff panels
 * keep their own chrome and are unaffected.
 */
export default async function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSessionUser().catch(() => null);

  let hasBookings = false;
  if (session) {
    const supabase = await createClient();
    hasBookings =
      (await countCustomerOrders(supabase, session.profile.id).catch(() => 0)) >
      0;
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
