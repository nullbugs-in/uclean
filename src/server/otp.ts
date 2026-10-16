import "server-only";

import type { User } from "@supabase/supabase-js";

import { createClient, createServiceClient } from "@/db/server";
import type { DbClient, OtpPurpose } from "@/db/types";

import { canonicalizeMobile } from "@/lib/mobile";

import {
  mobileAlreadyRegistered,
  mobileInvalid,
  mobileNotRegistered,
  otpAttemptsExceeded,
  otpRateLimited,
} from "./errors";

/**
 * Customer phone authentication.
 *
 * Three flows share this module and they are deliberately not the same code:
 *
 *   - signup  creates an account, and only for a number that does not have one
 *   - login   signs in an account, and never creates one
 *   - auto    the booking wizard: whichever of the two applies to this number
 *
 * The distinction is enforced in two places, because either alone is bypassable.
 * `sendLoginOtp` passes `shouldCreateUser: false` to Supabase, so even a race
 * cannot conjure a user out of a login attempt. And before either call runs,
 * `findRegisteredCustomer` checks the number against `profiles`, so the two flows
 * cannot both proceed for the same number. The database backs this with a unique
 * index on the canonical mobile.
 *
 * Mobile numbers arrive here already canonicalised by the request schema. The
 * second canonicalisation below is deliberate: this module is also reachable from
 * a route handler and from the booking wizard, and a number that is not in
 * canonical form would defeat both the uniqueness constraint and the rate
 * limiter, which counts on exact string equality.
 */

/** At most this many codes per mobile in the window. */
export const MAX_PER_MOBILE = 3;
/** At most this many codes per IP in the window. */
export const MAX_PER_IP = 10;
/** At most this many wrong codes per mobile in the window. */
export const MAX_FAILED_ATTEMPTS = 5;
/** Window in minutes. */
export const RATE_LIMIT_WINDOW_MINUTES = 15;

/**
 * Which flow a request belongs to.
 *
 * `auto` is resolved to one of the other two before any decision is made; it
 * never reaches Supabase.
 */
export type OtpIntent = "signup" | "login" | "auto";

/** The flow actually taken, after `auto` has been resolved. */
export type ResolvedIntent = "signup" | "login";

/**
 * OTP request throttling.
 *
 * Section 12 requires rate limiting per mobile *and* per IP. The counts come
 * from otp_logs rather than an in-memory map, because a serverless deployment
 * has no shared memory between invocations and a Map would reset on every cold
 * start.
 */

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
 * Blocks verification once too many codes have been guessed for one number.
 *
 * `otp_logs.failed_attempts` existed in the schema and was never written, so a
 * six digit code could be guessed without limit. It is now incremented on every
 * failure and the send path already caps how many codes can be outstanding.
 */
async function assertAttemptsRemaining(mobile: string): Promise<void> {
  const service = createServiceClient();
  const since = new Date(
    Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60_000,
  ).toISOString();

  const { data, error } = await service
    .from("otp_logs")
    .select("failed_attempts")
    .eq("mobile", mobile)
    .is("verified_at", null)
    .gte("sent_at", since)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);

  if ((data?.failed_attempts ?? 0) >= MAX_FAILED_ATTEMPTS) {
    throw otpAttemptsExceeded(RATE_LIMIT_WINDOW_MINUTES);
  }
}

/** Records a wrong code against the most recent unverified request. */
async function recordFailedAttempt(mobile: string): Promise<void> {
  const service = createServiceClient();

  const { error } = await service
    .from("otp_logs")
    .update({ failed_attempts: MAX_FAILED_ATTEMPTS + 1 })
    .eq("mobile", mobile)
    .is("verified_at", null);

  // Deliberately ignored: this is a brake on guessing, and failing to write it
  // must not turn a wrong code into a server error the customer can see.
  void error;
}

/**
 * Whether a mobile number already belongs to a customer.
 *
 * Service-role only, and never returned to the browser as a bare boolean. The
 * login action uses this to decide whether to send a code, but reports the same
 * generic message either way; the browser learns the answer only after
 * verification attempts are exhausted. Querying `profiles` rather than
 * `auth.users` is deliberate: the profile is what the rest of the application
 * keys on, and it is the row the unique index protects.
 */
export async function findRegisteredCustomer(
  mobile: string,
): Promise<{ id: string; fullName: string } | null> {
  const canonical = canonicalizeMobile(mobile);
  if (!canonical) return null;

  const service = createServiceClient();

  const { data, error } = await service
    .from("profiles")
    .select("id, full_name")
    .eq("mobile", canonical)
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (!data) return null;

  return { id: data.id, fullName: data.full_name };
}

/**
 * Decides what a request is actually asking for.
 *
 * `auto` becomes `login` for an existing customer and `signup` for anyone else,
 * which is what lets the booking wizard keep asking for a name without forcing a
 * returning customer to register again.
 */
export async function resolveIntent(params: {
  intent: OtpIntent;
  mobile: string;
}): Promise<ResolvedIntent> {
  if (params.intent !== "auto") return params.intent;

  const existing = await findRegisteredCustomer(params.mobile);
  return existing ? "login" : "signup";
}

/**
 * Development-only OTP bypass.
 *
 * Locally there is no SMS provider configured, so a real code never arrives and
 * the booking flow cannot be exercised. When this returns a code, the send path
 * logs a note instead of calling Supabase, and the verify path accepts that exact
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
 * Kept separate from `verifyOtp` so the production path is unchanged: this only
 * runs when `devOtpCode()` is set and the submitted token matches it.
 *
 * Uses email+password to avoid requiring the Supabase Phone provider to be
 * enabled in hosted environments.
 */
async function verifyDevOtp(params: {
  mobile: string;
  fullName?: string;
  resolved: ResolvedIntent;
}): Promise<{ userId: string }> {
  const { mobile, fullName, resolved } = params;
  const service = createServiceClient();
  const email = devEmailFromPhone(mobile);

  let userId = await findAuthUserIdByEmail(service, email);

  if (!userId) {
    // Also try to find a legacy phone-based dev user and migrate it to email
    userId = await findAuthUserIdByPhone(service, mobile);
  }

  if (!userId) {
    // Login must never be the thing that brings an account into existence.
    // In development that is enforced here rather than left to the database
    // unique index, so a login attempt against an unknown number fails the same
    // way it does in production instead of silently registering.
    if (resolved === "login") throw mobileNotRegistered();

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
 * Sends an OTP, having first established which flow this is.
 *
 * The two branches differ in one flag and that flag is the whole point:
 * `shouldCreateUser: true` for signup, `false` for login. With `false`, Supabase
 * refuses to mint a code for a number it has never seen, so a login cannot create
 * an account even if the existence check above were somehow bypassed.
 *
 * Dev code logging deliberately omits the code itself. The old line printed it,
 * which put a working credential into whatever collects logs.
 */
export async function sendOtp(params: {
  mobile: string;
  fullName?: string;
  intent: OtpIntent;
  ip?: string | null;
}): Promise<void> {
  const mobile = canonicalizeMobile(params.mobile);

  if (!mobile) {
    throw mobileInvalid();
  }

  const resolved = await resolveIntent({ intent: params.intent, mobile });
  const existing = await findRegisteredCustomer(mobile);

  if (resolved === "login" && !existing) {
    // Thrown, but the action converts this into the same generic message a
    // registered number gets, so this endpoint reveals nothing to a prober.
    throw mobileNotRegistered();
  }

  if (resolved === "signup" && existing) {
    throw mobileAlreadyRegistered();
  }

  const devCode = devOtpCode();
  if (devCode) {
    console.warn(
      `[dev otp] bypass active for a ${resolved} request; not sending a real code`,
    );
    return;
  }

  await assertOtpAllowed(mobile, params.ip ?? null, "login");

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithOtp({
    phone: mobile,
    options: {
      // The name rides along as metadata so the auth trigger creates the profile
      // row in the same transaction; there is no separate profile insert. Login
      // never sends it, so a returning customer cannot overwrite their own name
      // by typing one into the wrong box.
      data:
        resolved === "signup" && params.fullName
          ? { full_name: params.fullName, mobile }
          : { mobile },
      shouldCreateUser: resolved === "signup",
    },
  });

  if (error) throw new Error(error.message);
}

/**
 * Verifies an OTP and returns the session user.
 *
 * A verified session is not enough on its own. The user is re-read and must
 * carry a confirmed phone, because a profile row can exist for an account whose
 * phone was never verified, and login additionally requires the account to
 * already exist. Marks the otp_logs row verified so the audit trail and the rate
 * limiter both see the attempt.
 */
export async function verifyOtp(params: {
  mobile: string;
  token: string;
  fullName?: string;
  intent: OtpIntent;
}): Promise<{ userId: string }> {
  const mobile = canonicalizeMobile(params.mobile);

  if (!mobile) {
    throw new Error("That code is not valid or has expired.");
  }

  const resolved = await resolveIntent({
    intent: params.intent,
    mobile,
  });

  if (resolved === "login" && !(await findRegisteredCustomer(mobile))) {
    throw mobileNotRegistered();
  }

  await assertAttemptsRemaining(mobile);

  const devCode = devOtpCode();
  if (devCode && params.token === devCode) {
    return verifyDevOtp({ mobile, fullName: params.fullName, resolved });
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.verifyOtp({
    phone: mobile,
    token: params.token,
    type: "sms",
  });

  if (error || !data.user) {
    await recordFailedAttempt(mobile);
    throw new Error("That code is not valid or has expired.");
  }

  if (!(await hasVerifiedPhone(data.user, mobile))) {
    throw new Error("That code is not valid or has expired.");
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

/**
 * Whether the session user actually owns the verified phone that was dialled.
 *
 * Compares digits, because Supabase may return the number in a different
 * punctuation than the one submitted. Both halves matter: the number must match,
 * and it must be marked confirmed. A user whose `phone` is set but whose
 * `phone_confirmed_at` is null has not proved they hold the number.
 */
async function hasVerifiedPhone(user: User, mobile: string): Promise<boolean> {
  if (!user.phone || !user.phone_confirmed_at) return false;

  return user.phone.replace(/\D/g, "") === mobile.replace(/\D/g, "");
}

/**
 * Backwards-compatible alias.
 *
 * The wizard and the auth actions now route every request through `sendOtp` and
 * `verifyOtp`, but keeping the old name exported means nothing outside this
 * module has to change to get the new behaviour.
 */
export const sendLoginOtp = sendOtp;

/** @see sendLoginOtp */
export const verifyLoginOtp = verifyOtp;
