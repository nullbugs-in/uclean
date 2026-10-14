"use server";

import { headers } from "next/headers";

import { sendLoginOtp } from "@/server/otp";

export type OtpActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

/**
 * Requests a login OTP.
 *
 * Errors are returned rather than thrown so the form can render them inline;
 * the DomainError userMessage is already written for a customer, not a
 * developer.
 */
export async function requestLoginOtpAction(input: {
  mobile: string;
  fullName?: string;
}): Promise<OtpActionResult> {
  const headerList = await headers();
  const ip =
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headerList.get("x-real-ip");

  try {
    await sendLoginOtp({
      mobile: input.mobile,
      fullName: input.fullName,
      ip,
    });

    return { ok: true, message: `We sent a code to ${input.mobile}.` };
  } catch (error) {
    if (error instanceof Error && "userMessage" in error) {
      return {
        ok: false,
        message: String((error as { userMessage: string }).userMessage),
      };
    }
    return {
      ok: false,
      message: "We could not send a code right now. Please try again shortly.",
    };
  }
}
