"use server";

import { revalidatePath } from "next/cache";

import { createServiceClient } from "@/db/server";
import { mobileSchema } from "@/lib/validation/auth";
import { requireRoleOrRedirect } from "@/server/auth";
import { DomainError } from "@/server/errors";

import { z } from "zod";

export type UpdateProfileResult =
  | { ok: true }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

/**
 * What a customer is allowed to change about themselves.
 *
 * Only these four columns. `role`, `is_active` and `can_view_all_orders` are
 * deliberately absent from the schema below, so no value submitted in their
 * place can reach the database even if a caller sends one.
 *
 * See the note on `updateProfileAction` for why the write does not go through
 * the request-scoped client.
 */
const editableProfileSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your name").max(120),
  mobile: mobileSchema,
  // Empty is meaningful: it clears the field rather than storing "".
  email: z
    .string()
    .trim()
    .email("Enter a valid email address")
    .max(160)
    .optional()
    .or(z.literal("")),
  whatsappNumber: z
    .string()
    .trim()
    .regex(/^\+?[1-9]\d{9,14}$/, "Enter a valid WhatsApp number")
    .optional()
    .or(z.literal("")),
});

/**
 * Updates the signed-in customer's own profile row.
 *
 * The write deliberately goes through the service-role client rather than the
 * request-scoped one. RLS policy `profiles_update_self` is a whole-row policy:
 *
 *   create policy profiles_update_self on public.profiles for update
 *     using (id = auth.uid()) with check (id = auth.uid());
 *
 * It gates on *whose* row, never on *which columns*, so a request-scoped update
 * would let the caller set `role`, `is_active` or `can_view_all_orders` on
 * their own profile and grant themselves admin. The comment above that policy
 * in `08_indexes_functions_and_rls.sql` states those columns are not
 * user-editable, but nothing in the schema enforces it - there is no column
 * grant and no guard trigger, only `profiles_set_updated_at`.
 *
 * Routing through the service client and pinning the column list here is the
 * containment: this action cannot be used to escalate. It does NOT close the
 * underlying hole, because the PostgREST endpoint still accepts a direct
 * update. The real fix is a `BEFORE UPDATE` trigger in a migration that pins
 * those three columns to their existing values unless the actor is an admin.
 */
export async function updateProfileAction(
  input: z.input<typeof editableProfileSchema>,
): Promise<UpdateProfileResult> {
  const parsed = editableProfileSchema.safeParse(input);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }

    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Please check your details",
      fieldErrors,
    };
  }

  try {
    const session = await requireRoleOrRedirect(
      ["customer", "staff", "admin"],
      "/account/profile",
    );

    const service = createServiceClient();

    // Only the four editable columns are named here. This is the actual
    // authorisation boundary for the write; the object passed to Supabase is
    // built from scratch rather than spread from user input.
    const { error } = await service
      .from("profiles")
      .update({
        full_name: parsed.data.fullName,
        mobile: parsed.data.mobile,
        email: parsed.data.email || null,
        whatsapp_number: parsed.data.whatsappNumber || null,
      })
      .eq("id", session.profile.id);

    if (error) throw new Error(error.message);

    // Name and mobile are read fresh by every other screen (section 6.1), so
    // refreshing the account routes is what makes an edit show up on the
    // booking form and in notifications immediately.
    revalidatePath("/account/profile");
    revalidatePath("/book", "layout");

    return { ok: true };
  } catch (error) {
    if (error instanceof DomainError) {
      return { ok: false, message: error.userMessage };
    }

    console.error("Could not update the profile", error);
    return {
      ok: false,
      message: "We could not save your details. Please try again shortly.",
    };
  }
}
