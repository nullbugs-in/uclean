import { NextResponse } from "next/server";

import { verifyOtpSchema } from "@/lib/validation/auth";
import { DomainError } from "@/server/errors";
import { verifyOtp } from "@/server/otp";

/**
 * Verifies a customer OTP and establishes the session.
 *
 * Three things this route must not do, all of which it previously did:
 *
 *   - return `error.message` from a catch, which surfaced Supabase's own strings
 *     and the dev path's internals to the browser;
 *   - return the Supabase user id, which tells a caller which account a code
 *     belongs to;
 *   - accept unlimited guesses.
 *
 * The distinction between "wrong code" and "no such account" is deliberately not
 * made here either, until the attempt limit is reached. Below the limit both look
 * identical, which is what keeps the login endpoint from being an enumeration
 * oracle while still letting a genuine new customer discover they need to sign
 * up.
 */
export async function POST(request: Request) {
  const rawBody = (await request.json().catch(() => null)) as unknown;
  const parsed = verifyOtpSchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const { mobile, token, intent } = parsed.data;

  // Only used by the development test-code path, where no code was ever sent and
  // so there is nothing to rate limit against.
  const fullName =
    rawBody && typeof rawBody === "object" && "fullName" in rawBody
      ? String((rawBody as { fullName?: unknown }).fullName ?? "") || undefined
      : undefined;

  try {
    await verifyOtp({ mobile, token, fullName, intent });

    // Deliberately no userId in the body. The caller only needs to know the
    // session cookie was set, and the id would let a caller that guessed a code
    // confirm which account it belonged to.
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof DomainError) {
      // Attempt limit reached, or the account genuinely does not exist and the
      // caller has already spent real attempts. This is the one moment the
      // distinction is allowed out.
      if (
        error.code === "OTP_ATTEMPTS_EXCEEDED" ||
        error.code === "MOBILE_NOT_REGISTERED"
      ) {
        return NextResponse.json(
          { error: error.userMessage, unregistered: true },
          { status: error.status },
        );
      }

      return NextResponse.json(
        { error: error.userMessage },
        { status: error.status },
      );
    }

    // Anything unexpected is logged here and reduced to a sentence the customer
    // can act on. The original message is never forwarded.
    console.error("OTP verification failed", error);

    return NextResponse.json(
      { error: "That code is not valid or has expired." },
      { status: 401 },
    );
  }
}
