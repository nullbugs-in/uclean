import { NextResponse } from "next/server";

import { verifyOtpSchema } from "@/lib/validation/auth";
import { verifyLoginOtp } from "@/server/otp";

/**
 * Verifies an OTP and establishes the session cookie.
 *
 * Verification runs server side through the request-scoped Supabase client, so
 * the session cookie is written by the same server that owns the cookie store.
 * The browser never handles a token directly.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as unknown;
  const parsed = verifyOtpSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  try {
    const { userId } = await verifyLoginOtp(parsed.data);
    return NextResponse.json({ ok: true, userId });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "That code is not valid or has expired.",
      },
      { status: 401 },
    );
  }
}
