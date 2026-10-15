"use client";

import { OtpVerifyStage } from "@/components/otp-verify-stage";

/**
 * The standalone verify page, kept for anyone arriving with a bookmarked or
 * shared `/auth/verify-otp?mobile=...` link.
 *
 * The verify logic now lives in `OtpVerifyStage`, which the login and sign-up
 * forms use inline so a code can be entered without leaving the page.
 */
export function VerifyOtpForm({
  mobile,
  redirectTo,
  devTestCode,
}: {
  mobile: string;
  redirectTo: string;
  /** Non-null only in development, where the fixed code is shown as a hint. */
  devTestCode: string | null;
}) {
  return (
    <OtpVerifyStage
      mobile={mobile}
      redirectTo={redirectTo}
      devTestCode={devTestCode}
    />
  );
}
