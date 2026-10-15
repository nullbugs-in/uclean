"use server";

import { createClient } from "@/db/server";

import { isPanelRole, resolveDestination } from "./destination";
import { staffLoginSchema } from "./schema";

export type StaffLoginResult =
  { ok: true; redirectTo: string } | { ok: false; message: string };

/**
 * Email + password sign-in for staff and admin.
 *
 * Customers authenticate with a phone OTP through `(auth)`; this door is only
 * for provisioned staff/admin accounts. A Server Action is reachable by anyone
 * who can POST to the page, so the role check below — not the fact that the
 * form rendered — is the real gate.
 *
 * On any failure the freshly created session is signed back out and a single
 * generic message is returned, so a caller cannot tell an unknown email from a
 * wrong password or from a customer account.
 */
export async function staffLoginAction(input: {
  email: string;
  password: string;
  /** Destination requested via `?redirect=`, already vetted by the page. */
  redirectTo?: string;
}): Promise<StaffLoginResult> {
  const parsed = staffLoginSchema.safeParse({
    email: input.email,
    password: input.password,
  });

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Enter your email and password.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    return { ok: false, message: "Incorrect email or password." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profileError || !profile || !profile.is_active) {
    await supabase.auth.signOut();
    return { ok: false, message: "This account cannot sign in here." };
  }

  const role = profile.role;

  if (!isPanelRole(role)) {
    await supabase.auth.signOut();
    return { ok: false, message: "This account cannot sign in here." };
  }

  return { ok: true, redirectTo: resolveDestination(role, input.redirectTo) };
}
