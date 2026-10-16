"use server";

import { headers } from "next/headers";

import {
  autoRequestSchema,
  loginRequestSchema,
  signupRequestSchema,
} from "@/lib/validation/auth";
import { DomainError, type DomainErrorCode } from "@/server/errors";
import { sendOtp } from "@/server/otp";

export type OtpActionResult =
  | { ok: true; message: string }
  | {
      ok: false;
      message: string;
      /**
       * Lets a form branch on the reason without matching on the wording of a
       * user-facing sentence, which is free to change.
       */
      code?: DomainErrorCode;
      fieldErrors?: Record<string, string>;
    };

/**
 * The one text the login form shows after asking for a code.
 *
 * Identical whether or not the number exists. This is the only place the two
 * cases are allowed to diverge, and it deliberately does not: a distinct
 * "no such account" here would turn the login page into an oracle that lists
 * every registered customer for anyone with a phone number list. The truth
 * arrives later, on the verify route, and only after the attempt limit.
 */
const GENERIC_SENT_MESSAGE =
  "If that mobile number is registered, we have sent a 6 digit code to it.";

async function requestIp(): Promise<string | null> {
  const headerList = await headers();

  return (
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headerList.get("x-real-ip")
  );
}

/**
 * Pulls a user-facing message off an error.
 *
 * DomainError messages are written for a customer; anything else is replaced
 * rather than shown, so a Supabase string or a stack trace can never reach the
 * page. `maskedAs` is what an unexpected failure is reported as, which for login
 * is the generic message so a backend fault does not turn into an oracle either.
 */
function toActionError(
  error: unknown,
  maskedAs: string,
): { ok: false; message: string; code?: DomainErrorCode } {
  if (error instanceof DomainError) {
    return { ok: false, message: error.userMessage, code: error.code };
  }

  console.error("OTP request failed", error);
  return { ok: false, message: maskedAs };
}

/** The first message for the first field, which is all a form needs to render. */
function firstFieldError(error: {
  flatten: () => { fieldErrors: Record<string, string[] | undefined> };
}): Record<string, string> | undefined {
  const fieldErrors = error.flatten().fieldErrors;
  const [entry] = Object.entries(fieldErrors);

  if (!entry) return undefined;

  const [field, messages] = entry;
  const message = messages?.[0];

  return message ? { [field]: message } : undefined;
}

/**
 * Signup: request a code for a number that has no account yet.
 *
 * Refuses a number that is already registered rather than quietly signing the
 * person in. A returning customer who lands here should be sent to login, and
 * being told so is the whole value of this action existing separately.
 */
export async function requestSignupOtpAction(input: {
  mobile: string;
  fullName: string;
}): Promise<OtpActionResult> {
  const parsed = signupRequestSchema.safeParse({
    intent: "signup",
    mobile: input.mobile,
    fullName: input.fullName,
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check your details.",
      fieldErrors: firstFieldError(parsed.error),
    };
  }

  try {
    await sendOtp({
      mobile: parsed.data.mobile,
      fullName: parsed.data.fullName,
      intent: "signup",
      ip: await requestIp(),
    });

    return {
      ok: true,
      message: `We sent a 6 digit code to ${parsed.data.mobile}.`,
    };
  } catch (error) {
    return toActionError(error, GENERIC_SENT_MESSAGE);
  }
}

/**
 * Login: request a code for a number that already has an account.
 *
 * Never creates one. `shouldCreateUser: false` in the send path is the hard
 * guarantee; the generic success message is what keeps this endpoint from
 * answering the question the attacker is actually asking.
 */
export async function requestLoginOtpAction(input: {
  mobile: string;
}): Promise<OtpActionResult> {
  const parsed = loginRequestSchema.safeParse({
    intent: "login",
    mobile: input.mobile,
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Enter your mobile number.",
      fieldErrors: firstFieldError(parsed.error),
    };
  }

  try {
    await sendOtp({
      mobile: parsed.data.mobile,
      intent: "login",
      ip: await requestIp(),
    });

    return { ok: true, message: GENERIC_SENT_MESSAGE };
  } catch (error) {
    return toActionError(error, GENERIC_SENT_MESSAGE);
  }
}

/**
 * The booking wizard: sign the customer in if they have an account, register
 * them if they do not.
 *
 * The wizard asks for a name on its first step because most people reaching it
 * are new, but a returning customer must not be pushed through signup. The
 * server resolves which of the two this is and the supplied name is used only on
 * the signup branch, so it can never overwrite an existing profile.
 */
export async function requestAutoOtpAction(input: {
  mobile: string;
  fullName: string;
}): Promise<OtpActionResult> {
  const parsed = autoRequestSchema.safeParse({
    intent: "auto",
    mobile: input.mobile,
    fullName: input.fullName,
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check your details.",
      fieldErrors: firstFieldError(parsed.error),
    };
  }

  try {
    await sendOtp({
      mobile: parsed.data.mobile,
      fullName: parsed.data.fullName,
      intent: "auto",
      ip: await requestIp(),
    });

    return {
      ok: true,
      message: `We sent a 6 digit code to ${parsed.data.mobile}.`,
    };
  } catch (error) {
    return toActionError(error, GENERIC_SENT_MESSAGE);
  }
}
