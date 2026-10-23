"use server";

import { revalidatePath } from "next/cache";

import { createClient, createServiceClient } from "@/db/server";
import {
  AddressError,
  deleteAddress,
  setDefaultAddress,
  updateAddress,
} from "@/server/addresses";
import { getAuthUser, requireRoleOrRedirect } from "@/server/auth";
import { DomainError } from "@/server/errors";
import { addressSchema } from "@/lib/validation/booking";
import { mobileSchema } from "@/lib/validation/auth";

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
  /*
   * WhatsApp shares the mobile field's strict canonicalisation. The loose
   * regex it used to have accepted anything E.164-shaped and stored it verbatim,
   * so `919876543210` and `+919876543210` described one person while reading
   * like two; the same customer must have one string for every consumer. An
   * empty value means `clear it`, just like the email field above.
   */
  whatsappNumber: mobileSchema.optional().or(z.literal("")),
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

export type AddressActionResult =
  | { ok: true }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

/**
 * What a customer may change about one of their own addresses.
 *
 * The id is a uuid because it comes straight back from the browser, and an
 * unvalidated id in an `.eq()` is not a risk on its own but there is no reason
 * to let an arbitrary string reach a query builder. The text goes through the
 * same `addressSchema` the booking form uses, so an address that would be
 * rejected at booking time cannot be stored here either.
 *
 * Coordinates are not editable: they are the store point placeholder described
 * in the booking wizard, and accepting them from the browser would mean storing
 * a location nobody chose.
 */
const editableAddressSchema = z.object({
  id: z.string().uuid("That address could not be found"),
  addressText: addressSchema,
  label: z.string().trim().max(40).optional(),
});

/**
 * Maps a failure from the address server layer onto something a customer can
 * read, without letting a database message through.
 */
function toAddressResult(error: unknown): { ok: false; message: string } {
  if (error instanceof AddressError) {
    return { ok: false, message: error.userMessage };
  }

  console.error("Address change failed", error);
  return {
    ok: false,
    message: "We could not update your addresses. Please try again shortly.",
  };
}

/** Edits one of the signed-in customer's addresses. */
export async function updateAddressAction(
  input: z.input<typeof editableAddressSchema>,
): Promise<AddressActionResult> {
  const parsed = editableAddressSchema.safeParse(input);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }

    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Please check the address",
      fieldErrors,
    };
  }

  try {
    const user = await getAuthUser();
    if (!user) {
      return {
        ok: false,
        message: "Your session has expired. Please sign in again.",
      };
    }

    const supabase = await createClient();
    await updateAddress(supabase, user.id, parsed.data);

    // The booking page reads the default address on every render, so it has to
    // be refreshed too or the next booking offers the old one.
    revalidatePath("/account/profile");
    revalidatePath("/book", "layout");

    return { ok: true };
  } catch (error) {
    return toAddressResult(error);
  }
}

const addressIdSchema = z.object({
  id: z.string().uuid("That address could not be found"),
});

/** Promotes one of the customer's addresses to be the one offered at booking. */
export async function setDefaultAddressAction(
  input: z.input<typeof addressIdSchema>,
): Promise<AddressActionResult> {
  const parsed = addressIdSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "That address could not be found" };
  }

  try {
    const user = await getAuthUser();
    if (!user) {
      return {
        ok: false,
        message: "Your session has expired. Please sign in again.",
      };
    }

    const supabase = await createClient();
    await setDefaultAddress(supabase, user.id, parsed.data.id);

    revalidatePath("/account/profile");
    revalidatePath("/book", "layout");

    return { ok: true };
  } catch (error) {
    return toAddressResult(error);
  }
}

/** Removes one of the customer's addresses. */
export async function deleteAddressAction(
  input: z.input<typeof addressIdSchema>,
): Promise<AddressActionResult> {
  const parsed = addressIdSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "That address could not be found" };
  }

  try {
    const user = await getAuthUser();
    if (!user) {
      return {
        ok: false,
        message: "Your session has expired. Please sign in again.",
      };
    }

    const supabase = await createClient();
    await deleteAddress(supabase, user.id, parsed.data.id);

    revalidatePath("/account/profile");
    revalidatePath("/book", "layout");

    return { ok: true };
  } catch (error) {
    return toAddressResult(error);
  }
}
