import { Footer } from "@/components/layout/footer";
import { Navbar } from "@/components/layout/navbar";
import { WhatsAppFloat } from "@/components/layout/whatsapp-float";
import { getSessionUser } from "@/server/auth";

/**
 * The navbar shows a profile menu instead of Log in / Sign up, so the session
 * has to be resolved here. That makes every public route dynamic, which the
 * previously static pricing pages now are.
 *
 * Only the public site reads the session this way. The admin and staff panels
 * keep their own chrome and are unaffected.
 */
export default async function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSessionUser().catch(() => null);

  return (
    <div className="flex min-h-dvh flex-col">
      <Navbar
        user={
          session
            ? {
                fullName: session.profile.full_name,
                mobile: session.profile.mobile,
                role: session.profile.role,
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
