import "server-only";

import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";

import { cronSecret } from "@/server/env";

/**
 * Authorization for /api/cron/* routes.
 *
 * Vercel Cron endpoints are ordinary public URLs, and the source document
 * requires notification retries and slot reminders without saying how those
 * endpoints are protected. Without a check, anyone who learns the URL can make
 * the app drain its queue or spam customers with reminders.
 *
 * Vercel sends CRON_SECRET as the Authorization header on every scheduled
 * invocation, so the secret must be set on the Vercel project as well as in
 * .env.local.
 */
export function requireCronAuth(request: NextRequest): NextResponse | null {
  const expected = process.env.CRON_SECRET;

  if (!expected) {
    // Fail closed. A misconfigured deployment must not expose the cron surface.
    return NextResponse.json(
      { error: "Cron is not configured on this deployment." },
      { status: 503 },
    );
  }

  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!safeEqual(provided, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export { cronSecret };
