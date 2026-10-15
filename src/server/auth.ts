import "server-only";

import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { createClient } from "@/db/server";
import type { AppRole, Profile } from "@/db/types";

import { forbidden, unauthenticated } from "./errors";

export type SessionUser = {
  authUser: User;
  profile: Profile;
};

export type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

/** The signed-in auth user, or null. Does not touch the database. */
export async function getAuthUser(): Promise<User | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error) return null;
  return data.user ?? null;
}

/**
 * The signed-in user with their profile row attached.
 *
 * The profile is what carries the role, and it is re-read on every call rather
 * than trusted from a cookie claim: a role change must take effect immediately,
 * not when the session happens to expire.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) throw new Error(profileError.message);
  if (!profile) return null;

  return { authUser: user, profile };
}

/**
 * Requires a signed-in user with one of the given roles.
 *
 * This is the check that matters. Middleware is a fast filter for redirects and
 * page layout, but it runs before the session cookie is refreshed and cannot be
 * the only gate, so every page and every server action calls this too.
 */
export async function requireRole(
  roles: readonly AppRole[],
): Promise<SessionUser> {
  const session = await getSessionUser();

  if (!session) throw unauthenticated();
  if (!roles.includes(session.profile.role)) throw forbidden();
  if (!session.profile.is_active) throw forbidden();

  return session;
}

export async function requireCustomer(): Promise<SessionUser> {
  return requireRole(["customer"]);
}

export async function requireStaff(): Promise<SessionUser> {
  return requireRole(["staff", "admin"]);
}

export async function requireAdmin(): Promise<SessionUser> {
  return requireRole(["admin"]);
}

/**
 * Which sign-in door serves a given destination. Staff and admin panels use the
 * email + password page (`/staff/login`); everything else uses the customer
 * phone-OTP flow. Without this, a signed-out staff member is dropped on the
 * customer sign-in.
 */
function signInPathFor(destination: string): string {
  if (destination.startsWith("/staff") || destination.startsWith("/admin")) {
    return "/staff/login";
  }

  return "/auth/login";
}

/**
 * Require a role and redirect rather than throw. Use in page and layout code,
 * where a thrown DomainError would surface as an error boundary.
 */
export async function requireRoleOrRedirect(
  roles: readonly AppRole[],
  signInPath: string,
): Promise<SessionUser> {
  const session = await getSessionUser();

  if (!session) {
    const params = new URLSearchParams({ redirect: signInPath });
    redirect(`${signInPathFor(signInPath)}?${params}`);
  }

  if (!roles.includes(session.profile.role) || !session.profile.is_active) {
    // 404 rather than 403 so the existence of the panel is not disclosed.
    redirect("/");
  }

  return session;
}
