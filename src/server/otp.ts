import "server-only";

import { createClient, createServiceClient } from "@/db/server";
import type { DbClient, OtpPurpose } from "@/db/types";

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
 * Development-only OTP bypass.
 *
 * Locally there is no SMS provider configured, so a real code never arrives and
 * the booking flow cannot be exercised. When this returns a code, `sendLoginOtp`
 * logs it instead of calling Supabase, and `verifyLoginOtp` accepts that exact
 * code.
 *
 * Hard-disabled whenever `NODE_ENV` is "production", so a production build can
 * never accept it no matter what the environment holds. In development it
 * defaults to 000000 and can be overridden with OTP_DEV_TEST_CODE, or switched
 * off entirely with OTP_DEV_TEST_CODE=off.
 */
export function devOtpCode(): string | null {
  if (process.env.NODE_ENV === "production") return null;

  const raw = process.env.OTP_DEV_TEST_CODE?.trim();
  if (raw === "off" || raw === "false") return null;
  return raw && /^[0-9]{4,8}$/.test(raw) ? raw : "000000";
}

/**
 * Password attached to dev test accounts.
 *
 * Supabase phone auth has no way to mint a session from an admin call in some
 * configurations, so the bypass creates the user (idempotently) with this
 * password and signs in with email+password to avoid requiring the Phone
 * provider. Only ever used alongside `devOtpCode`.
 */
const DEV_OTP_PASSWORD = "uclean-dev-otp-password";

function devEmailFromPhone(mobile: string): string {
  const digits = mobile.replace(/\D/g, "");
  return `dev-${digits}@uclean.test`;
}

/** Finds an existing auth user by phone, comparing digits only. */
async function findAuthUserIdByPhone(
  service: DbClient,
  mobile: string,
): Promise<string | null> {
  const digits = mobile.replace(/\D/g, "");

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw new Error(error.message);

    const match = data.users.find(
      (user) => (user.phone ?? "").replace(/\D/g, "") === digits,
    );
    if (match) return match.id;
    if (data.users.length < 1000) return null;
  }

  return null;
}

/** Finds an existing auth user by email. */
async function findAuthUserIdByEmail(
  service: DbClient,
  email: string,
): Promise<string | null> {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw new Error(error.message);

    const match = data.users.find((user) => user.email === email);
    if (match) return match.id;
    if (data.users.length < 1000) return null;
  }

  return null;
}

/**
 * Mints a real Supabase session for the dev test code.
 *
 * Kept separate from `verifyLoginOtp` so the production path is unchanged: this
 * only runs when `devOtpCode()` is set and the submitted token matches it.
 *
 * Uses email+password to avoid requiring the Supabase Phone provider to be
 * enabled in hosted environments.
 */
async function verifyDevLoginOtp(params: {
  mobile: string;
  fullName?: string;
}): Promise<{ userId: string }> {
  const { mobile, fullName } = params;
  const service = createServiceClient();
  const email = devEmailFromPhone(mobile);

  let userId = await findAuthUserIdByEmail(service, email);

  if (!userId) {
    // Also try to find a legacy phone-based dev user and migrate it to email
    userId = await findAuthUserIdByPhone(service, mobile);
  }

  if (!userId) {
    const { data, error } = await service.auth.admin.createUser({
      email,
      password: DEV_OTP_PASSWORD,
      email_confirm: true,
      user_metadata: fullName
        ? { full_name: fullName, mobile, dev: true }
        : { mobile, dev: true },
    });

    if (error) throw new Error(error.message);
    userId = data.user?.id ?? null;

    if (!userId) {
      throw new Error("Dev sign-in could not create the test user.");
    }
  } else {
    // Ensure the user has the email identity and known password for email sign-in.
    const { error } = await service.auth.admin.updateUserById(userId, {
      email,
      password: DEV_OTP_PASSWORD,
      email_confirm: true,
      user_metadata: {
        ...(fullName ? { full_name: fullName } : {}),
        mobile,
        dev: true,
      },
    });
    if (error) throw new Error(error.message);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: DEV_OTP_PASSWORD,
  });

  if (error || !data.user) {
    throw new Error(error?.message ?? "Dev sign-in failed.");
  }

  return { userId: data.user.id };
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

  const devCode = devOtpCode();
  if (devCode) {
    console.warn(`[dev otp] code for ${mobile} is ${devCode}`);
    return;
  }

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
  fullName?: string;
}): Promise<{ userId: string }> {
  const { mobile, token, fullName } = params;

  const devCode = devOtpCode();
  if (devCode && token === devCode) {
    return verifyDevLoginOtp({ mobile, fullName });
  }

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
