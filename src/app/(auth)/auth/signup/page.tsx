import type { Metadata } from "next";
import Image from "next/image";

import { Card, CardContent } from "@/components/ui/card";
import { siteConfig } from "@/config/site";

import { devOtpCode } from "@/server/otp";

import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Create your UClean account" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect: redirectTo = "/" } = await searchParams;

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
            Sign up for UClean
          </h1>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            Enter your name and mobile number. We’ll send you a one-time code.
          </p>
        </div>
        <SignUpForm redirectTo={redirectTo} devTestCode={devOtpCode()} />
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
