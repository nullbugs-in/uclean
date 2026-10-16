"use client";

import { OtpVerifyStage } from "@/components/otp-verify-stage";

/**
 * The standalone verify page, kept for anyone arriving with a bookmarked or
 * shared `/auth/verify-otp?mobile=...` link.
 *
 * The verify logic lives in `OtpVerifyStage`, which the login and sign-up forms
 * use inline so a code can be entered without leaving the page.
 *
 * `intent` defaults to `login` here. This page is reached from a link that
 * carries only a number, and defaulting to signup would let anyone turn it into
 * a registration endpoint by adding one query parameter. Login is the safe
 * default because it never creates an account: an unrecognised number simply
 * fails, and the person is pointed at signup.
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
      intent="login"
      redirectTo={redirectTo}
      devTestCode={devTestCode}
    />
  );
}
