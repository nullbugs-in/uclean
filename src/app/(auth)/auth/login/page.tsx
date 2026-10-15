import type { Metadata } from "next";
import Image from "next/image";

import { Card, CardContent } from "@/components/ui/card";
import { siteConfig } from "@/config/site";

import { devOtpCode } from "@/server/otp";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in to UClean" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  // Signing in returns the customer to the hero, which is the first thing on
  // the home page. Naming it explicitly means the destination survives the
  // hero being reordered later, rather than depending on it happening to be
  // at the top. `scroll-padding-top` in globals.css keeps it clear of the
  // sticky navbar.
  const { redirect: redirectTo = "/#hero" } = await searchParams;

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
          <p className="text-xs font-semibold tracking-widest text-[var(--primary)] uppercase">
            Existing customers
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Welcome back to UClean
          </h1>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            Already have an account? Enter your mobile number and we’ll send you
            a one-time code.
          </p>
          <p className="mt-3 text-sm text-[var(--muted-foreground)]">
            New to UClean?{" "}
            <a
              className="font-medium text-[color-mix(in_oklab,var(--primary),black_35%)] underline-offset-4 hover:underline"
              href="/auth/signup"
            >
              Create an account
            </a>
          </p>
        </div>
        <div className="-mt-2">
          <LoginForm redirectTo={redirectTo} devTestCode={devOtpCode()} />
        </div>
        <div className="mt-6 space-y-2 text-center">
          <p className="text-xs text-[var(--muted-foreground)]">
            {siteConfig.tagline}
          </p>
          <p className="text-xs text-[var(--muted-foreground)]">
            Free pickup & delivery within {siteConfig.deliveryRadiusKm} km.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
