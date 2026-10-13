import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { AppRole } from "@/db/types";

/**
 * Route guards.
 *
 * This is a fast filter, not the security boundary. It refreshes the session
 * cookie and redirects obviously-wrong navigations, but the authoritative
 * check is `requireRole` in src/server/auth.ts, which every page and server
 * action calls as well. Middleware alone is not sufficient: it runs before the
 * session is refreshed and it cannot see a role that changed mid-session.
 */

const PROTECTED_PREFIXES: ReadonlyArray<{
  prefix: string;
  roles: readonly AppRole[];
}> = [
  { prefix: "/account", roles: ["customer", "staff", "admin"] },
  { prefix: "/staff", roles: ["staff", "admin"] },
  { prefix: "/admin", roles: ["admin"] },
];

const AUTH_PREFIXES = ["/auth"];

type CookieToSet = {
  name: string;
  value: string;
  options?: Record<string, unknown>;
};

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // Already signed in: skip the auth pages.
  if (user && AUTH_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return NextResponse.redirect(new URL("/account", request.url));
  }

  const guard = PROTECTED_PREFIXES.find(
    ({ prefix }) => path === prefix || path.startsWith(`${prefix}/`),
  );

  if (!guard) return response;

  // Preserve where they were headed so sign-in can return them there. The Book
  // Now button relies on this (section 5).
  if (!user) {
    const url = new URL("/auth/login", request.url);
    url.searchParams.set("redirect", `${path}${request.nextUrl.search}`);
    return NextResponse.redirect(url);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !profile.is_active) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (!guard.roles.includes(profile.role as AppRole)) {
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
