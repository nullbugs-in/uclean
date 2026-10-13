import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "./types";

/**
 * Browser Supabase client. Uses the anon key only; RLS applies to every query
 * it makes. Never import the service role key into anything reachable here.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
