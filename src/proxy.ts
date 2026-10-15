import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { AppRole } from "@/db/types";
import { PANEL_PREFIXES } from "@/lib/constants";

/**
 * Route guards.
 *
 * This is a fast filter, not the security boundary. It refreshes the session
 * cookie and redirects obviously-wrong navigations, but the authoritative
 * check is `requireRole` in src/server/auth.ts, which every page and server
 * action calls as well. The proxy alone is not sufficient: it runs before the
 * session is refreshed and it cannot see a role that changed mid-session.
 */

/** Staff and admin sign in with email + password; customers use the OTP page. */
const STAFF_LOGIN_PATH = "/staff/login";
const CUSTOMER_LOGIN_PATH = "/auth/login";

const PROTECTED_PREFIXES: ReadonlyArray<{
  prefix: string;
  roles: readonly AppRole[];
  /** Where a signed-out visitor is sent to sign in. */
  signInPath: string;
}> = [
  {
    prefix: "/account",
    roles: ["customer", "staff", "admin"],
    signInPath: CUSTOMER_LOGIN_PATH,
  },
  { prefix: "/staff", roles: ["staff", "admin"], signInPath: STAFF_LOGIN_PATH },
  { prefix: "/admin", roles: ["admin"], signInPath: STAFF_LOGIN_PATH },
];

const AUTH_PREFIXES = ["/auth"];

/**
 * Public paths that sit under a guarded prefix but must stay reachable while
 * signed out. `/staff/login` is the staff/admin sign-in page: it cannot sit
 * behind the guard it exists to get past. Its Server Action re-checks the role,
 * so this exemption leaks nothing.
 */
const PUBLIC_PATHS = [STAFF_LOGIN_PATH];

type CookieToSet = {
  name: string;
  value: string;
  options?: Record<string, unknown>;
};

type AuthUser = { id: string } | null;

type SupabaseClient = ReturnType<typeof createServerClient>;

/** Where a signed-in user belongs: their role's panel, or the customer panel. */
function panelPathFor(role: AppRole | null): string {
  if (role === "admin") return PANEL_PREFIXES.admin;
  if (role === "staff") return PANEL_PREFIXES.staff;
  return PANEL_PREFIXES.account;
}

/**
 * The signed-in user's role, or null when the profile is missing or inactive.
 *
 * Read per request rather than trusted from a cookie claim, so a role change
 * takes effect on the very next navigation.
 */
async function readRole(
  supabase: SupabaseClient,
  userId: string,
): Promise<AppRole | null> {
  const { data } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", userId)
    .maybeSingle();

  if (!data || !data.is_active) return null;
  return data.role as AppRole;
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const path = request.nextUrl.pathname;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let supabase: SupabaseClient | null = null;
  let user: AuthUser = null;

  if (supabaseUrl && supabaseAnonKey) {
    try {
      supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet: CookieToSet[]) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value),
            );
            response = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options),
            );
          },
        },
      });

      const { data } = await supabase.auth.getUser();
      user = data.user;
    } catch {
      // Supabase is unconfigured or unreachable. Rather than letting a bad
      // backend take the whole site down, fall through as an anonymous
      // visitor: public pages render and guarded routes redirect to sign-in.
      supabase = null;
      user = null;
    }
  }

  // Already signed in: skip the auth pages and go to the right panel. Without
  // this, a staff member who lands on a customer sign-in URL is sent to the
  // customer panel.
  if (user && AUTH_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    const role = supabase ? await readRole(supabase, user.id) : null;
    return NextResponse.redirect(new URL(panelPathFor(role), request.url));
  }

  if (PUBLIC_PATHS.includes(path)) return response;

  const guard = PROTECTED_PREFIXES.find(
    ({ prefix }) => path === prefix || path.startsWith(`${prefix}/`),
  );

  if (!guard) return response;

  // Preserve where they were headed so sign-in can return them there. The Book
  // Now button relies on this (section 5). Staff and admin are sent to the
  // password page; customers to the phone-OTP page.
  if (!user) {
    const url = new URL(guard.signInPath, request.url);
    url.searchParams.set("redirect", `${path}${request.nextUrl.search}`);
    return NextResponse.redirect(url);
  }

  // Defensive: `user` is only ever set when the client exists.
  if (!supabase) return response;

  const role = await readRole(supabase, user.id);

  if (!role) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (!guard.roles.includes(role)) {
    // Not a 403: redirecting home keeps the panels' existence undisclosed.
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except:
     * - /api, which does its own auth and webhook signature checks
     * - _next static and image assets
     * - files with a static extension
     *
     * /pay/[token] is deliberately included here: it is public, so no guard
     * matches it and it falls through untouched. Its token is the credential.
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
