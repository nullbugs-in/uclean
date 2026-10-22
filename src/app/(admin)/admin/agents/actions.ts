"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { StaffAccountError, setStaffActive } from "@/server/admin-staff";
import { requireAdmin } from "@/server/auth";
import { DomainError } from "@/server/errors";

/**
 * Agent access actions for the Staff module.
 *
 * Each opens with `requireAdmin()`, and unlike most of this app that is not
 * belt-and-braces: `admin-staff.ts` writes through the service client, which
 * bypasses RLS, and migration 09 revoked `update on profiles` from
 * `authenticated` exactly so that no signed-in user could set their own role.
 * There is no policy to lean on here, so this check is the whole gate.
 */

export type StaffActionResult =
  { ok: true; message?: string } | { ok: false; message: string };

const profileIdSchema = z
  .string()
  .uuid("That staff account could not be found.");

/** Refreshes the roster and any view that reads the same profiles. */
function revalidateTeamViews() {
  revalidatePath("/admin/agents");
}

function toMessage(error: unknown): string {
  if (error instanceof StaffAccountError || error instanceof DomainError) {
    return error.userMessage;
  }

  console.error("Staff account action failed", error);
  return "We could not save that change. Please try again shortly.";
}

export async function setStaffActiveAction(input: {
  profileId: string;
  isActive: boolean;
}): Promise<StaffActionResult> {
  const parsed = z
    .object({ profileId: profileIdSchema, isActive: z.boolean() })
    .safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "That account could not be updated.",
    };
  }

  try {
    const admin = await requireAdmin();

    await setStaffActive(
      parsed.data.profileId,
      parsed.data.isActive,
      admin.profile.id,
    );

    revalidateTeamViews();

    return {
      ok: true,
      message: parsed.data.isActive ? "Access restored." : "Access removed.",
    };
  } catch (error) {
    return { ok: false, message: toMessage(error) };
  }
}
