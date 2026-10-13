import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import type { Database, DbClient } from "./types";

type CookieToSet = {
  name: string;
  value: string;
  options?: Record<string, unknown>;
};

/**
 * Request-scoped client bound to the current session cookies.
 *
 * RLS applies, so this is the client that should reach for almost everything:
 * it cannot accidentally read a row the signed-in user is not allowed to see.
 */
export async function createClient(): Promise<DbClient> {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // The session is refreshed by middleware instead, so this is safe
            // to ignore.
          }
        },
      },
    },
  ) as unknown as DbClient;
}

/**
 * Service role client. Bypasses RLS entirely.
 *
 * Reserved for the things RLS cannot express: the notification queue worker,
 * payment and WhatsApp webhook handling, and OTP rate-limit accounting. Call
 * sites must pass an explicit, validated payload; never expose this client or
 * its key to the browser.
 */
export function createServiceClient(): DbClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase service role is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createSupabaseClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as DbClient;
}
