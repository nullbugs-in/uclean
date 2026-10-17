"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/db/server";
import { blockedDateSchema, slotSettingsSchema } from "@/lib/validation";
import type { BlockedDateInput, SlotSettingsInput } from "@/lib/validation";
import { requireAdmin } from "@/server/auth";
import { DomainError } from "@/server/errors";
import {
  addBlockedDate,
  removeBlockedDate,
  SlotSettingsError,
  updateTimeSlots,
} from "@/server/slot-settings";

/**
 * Admin slot-settings actions.
 *
 * Each opens with `requireAdmin()`, and the write is *also* gated by the
 * `time_slots_admin_write` / `blocked_dates_admin_write` RLS policies. That is
 * deliberate duplication: these are public endpoints, and the policy is what
 * makes a forgotten check a non-event rather than a vulnerability.
 *
 * Slots decide what the booking wizard offers, so every save revalidates
 * `/book` as well as this page.
 */

export type SlotSettingsActionResult =
  { ok: true; message: string } | { ok: false; message: string };

/** Maps a thrown error to the one line the form should show. */
function describeFailure(
  error: unknown,
  fallback: string,
  log: string,
): string {
  if (error instanceof SlotSettingsError) return error.userMessage;
  if (error instanceof DomainError) return error.userMessage;

  console.error(log, error);
  return fallback;
}

export async function saveTimeSlotsAction(
  input: SlotSettingsInput,
): Promise<SlotSettingsActionResult> {
  const parsed = slotSettingsSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ??
        "Please check the slots and try again.",
    };
  }

  try {
    const admin = await requireAdmin();
    const supabase = await createClient();

    const changed = await updateTimeSlots(
      supabase,
      admin.profile.id,
      parsed.data.slots,
    );

    revalidatePath("/admin/slots");
    revalidatePath("/book");

    return {
      ok: true,
      message:
        changed.length === 0
          ? "No changes to save."
          : `Saved ${changed.length} slot${changed.length === 1 ? "" : "s"}.`,
    };
  } catch (error) {
    return {
      ok: false,
      message: describeFailure(
        error,
        "We could not save the slots. Please try again.",
        "Could not save the time slots",
      ),
    };
  }
}

export async function addBlockedDateAction(
  input: BlockedDateInput,
): Promise<SlotSettingsActionResult> {
  const parsed = blockedDateSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ??
        "Please check the date and try again.",
    };
  }

  try {
    const admin = await requireAdmin();
    const supabase = await createClient();

    const saved = await addBlockedDate(supabase, admin.profile.id, parsed.data);

    revalidatePath("/admin/slots");
    revalidatePath("/book");

    return { ok: true, message: `${saved.date} is now blocked.` };
  } catch (error) {
    return {
      ok: false,
      message: describeFailure(
        error,
        "We could not block that date. Please try again.",
        "Could not block the date",
      ),
    };
  }
}

export async function removeBlockedDateAction(
  date: string,
): Promise<SlotSettingsActionResult> {
  try {
    const admin = await requireAdmin();
    const supabase = await createClient();

    await removeBlockedDate(supabase, admin.profile.id, date);

    revalidatePath("/admin/slots");
    revalidatePath("/book");

    return { ok: true, message: `${date} is no longer blocked.` };
  } catch (error) {
    return {
      ok: false,
      message: describeFailure(
        error,
        "We could not unblock that date. Please try again.",
        "Could not unblock the date",
      ),
    };
  }
}
