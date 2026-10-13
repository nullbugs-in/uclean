import "server-only";

import { createClient, createServiceClient } from "@/db/server";
import type { OtpPurpose } from "@/db/types";

import { otpRateLimited } from "./errors";

/**
 * OTP request throttling.
 *
 * Section 12 requires rate limiting per mobile *and* per IP. The counts come
 * from otp_logs rather than an in-memory map, because a serverless deployment
 * has no shared memory between invocations and a Map would reset on every cold
 * start.
 */

/** At most this many codes per mobile in the window. */
export const MAX_PER_MOBILE = 3;
/** At most this many codes per IP in the window. */
export const MAX_PER_IP = 10;
/** Window in minutes. */
export const RATE_LIMIT_WINDOW_MINUTES = 15;

export function assertOtpAllowed(
  mobile: string,
  ip: string | null,
  purpose: OtpPurpose = "login",
): Promise<void> {
  return enforceOtpRateLimit(mobile, ip, purpose);
}

async function enforceOtpRateLimit(
  mobile: string,
  ip: string | null,
  purpose: OtpPurpose,
): Promise<void> {
  const service = createServiceClient();
  const since = new Date(
    Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60_000,
  ).toISOString();

  const { count: mobileCount, error: mobileError } = await service
    .from("otp_logs")
    .select("id", { count: "exact", head: true })
    .eq("mobile", mobile)
    .gte("sent_at", since);

  if (mobileError) throw new Error(mobileError.message);

  if ((mobileCount ?? 0) >= MAX_PER_MOBILE) {
    throw otpRateLimited(RATE_LIMIT_WINDOW_MINUTES);
  }

  if (ip) {
    const { count: ipCount, error: ipError } = await service
      .from("otp_logs")
      .select("id", { count: "exact", head: true })
      .eq("request_ip", ip)
      .gte("sent_at", since);

    if (ipError) throw new Error(ipError.message);

    if ((ipCount ?? 0) >= MAX_PER_IP) {
      throw otpRateLimited(RATE_LIMIT_WINDOW_MINUTES);
    }
  }

  const { error: logError } = await service.from("otp_logs").insert({
    mobile,
    purpose,
    request_ip: ip,
  });

  if (logError) throw new Error(logError.message);
}

/**
 * Sends a login OTP to a mobile number.
 *
 * The display name is passed as metadata so the auth trigger can create the
 * profile row in the same transaction; there is no separate profile insert.
 */
export async function sendLoginOtp(params: {
  mobile: string;
  fullName?: string;
  ip?: string | null;
}): Promise<void> {
  const { mobile, fullName, ip } = params;

  await assertOtpAllowed(mobile, ip ?? null, "login");

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithOtp({
    phone: mobile,
    options: {
      data: fullName ? { full_name: fullName, mobile } : { mobile },
      shouldCreateUser: true,
    },
  });

  if (error) throw new Error(error.message);
}

/**
 * Verifies an OTP and returns the session user.
 *
 * Marks the otp_logs row verified so the audit trail and the rate limiter both
 * see the attempt.
 */
export async function verifyLoginOtp(params: {
  mobile: string;
  token: string;
}): Promise<{ userId: string }> {
  const { mobile, token } = params;
  const supabase = await createClient();

  const { data, error } = await supabase.auth.verifyOtp({
    phone: mobile,
    token,
    type: "sms",
  });

  if (error || !data.user) {
    throw new Error(error?.message ?? "That code is not valid or has expired.");
  }

  const service = createServiceClient();
  const { error: logError } = await service
    .from("otp_logs")
    .update({ verified_at: new Date().toISOString() })
    .eq("mobile", mobile)
    .is("verified_at", null);

  if (logError) throw new Error(logError.message);

  return { userId: data.user.id };
}
