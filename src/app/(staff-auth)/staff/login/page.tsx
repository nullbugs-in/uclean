import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";

import { Card, CardContent } from "@/components/ui/card";
import { siteConfig } from "@/config/site";
import { getSessionUser } from "@/server/auth";

import {
  isPanelRole,
  resolveDestination,
  safeRedirectTarget,
} from "./destination";
import { StaffLoginForm } from "./login-form";

export const metadata: Metadata = { title: "Staff sign in" };

/**
 * Email + password sign-in for staff and admin.
 *
 * Lives outside `(staff)` on purpose: that group's layout runs the role guard,
 * which would block a signed-out visitor from reaching a sign-in page. It is
 * also separate from `(auth)`, which stays the customer phone-OTP flow.
 */
export default async function StaffLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect: requested } = await searchParams;
  const redirectTo = safeRedirectTarget(requested);
  const session = await getSessionUser();

  if (session?.profile.is_active && isPanelRole(session.profile.role)) {
    redirect(resolveDestination(session.profile.role, redirectTo));
  }

  return (
    <Card className="relative w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[0_28px_60px_-28px_color-mix(in_oklab,var(--primary),transparent_65%)] ring-1 ring-black/5">
      <div className="absolute inset-x-0 top-0 h-1 rounded-t-2xl bg-gradient-to-r from-[var(--primary)] via-[var(--primary)] to-[var(--accent)]" />
      <CardContent className="p-6 sm:p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="relative mb-4 h-auto w-48">
            <Image
              src={siteConfig.logo.src}
              alt="UClean logo"
              width={siteConfig.logo.width}
              height={siteConfig.logo.height}
              priority
              className="h-auto w-full"
            />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Staff sign in
          </h1>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            Use the work email and password your manager set up for you.
          </p>
        </div>
        <StaffLoginForm redirectTo={redirectTo} />
      </CardContent>
    </Card>
  );
}
