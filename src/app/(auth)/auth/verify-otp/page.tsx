import type { Metadata } from "next";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";
import { devOtpCode } from "@/server/otp";

import { VerifyOtpForm } from "./verify-otp-form";

export const metadata: Metadata = { title: "Verify your number" };

export default async function VerifyOtpPage({
  searchParams,
}: {
  searchParams: Promise<{ mobile?: string; redirect?: string }>;
}) {
  const { mobile, redirect: redirectTo = "/" } = await searchParams;

  if (!mobile) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Verify your number</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-[var(--muted-foreground)]">
            Request a code first, then come back here to enter it.
          </p>
          <a
            className="text-sm font-medium text-[var(--primary)] underline-offset-4 hover:underline"
            href={`/auth/login?redirect=${encodeURIComponent(redirectTo)}`}
          >
            Sign in
          </a>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Verify your number</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-6 text-sm text-[var(--muted-foreground)]">
          Enter the code we sent to{" "}
          <span className="text-foreground font-medium">{mobile}</span>. It
          expires in a few minutes.
        </p>
        <VerifyOtpForm
          mobile={mobile}
          redirectTo={redirectTo}
          devTestCode={devOtpCode()}
        />
        <p className="mt-6 text-center text-xs text-[var(--muted-foreground)]">
          Requested {formatDateTime(new Date())}. Resend limits apply per mobile
          and per IP.
        </p>
      </CardContent>
    </Card>
  );
}
