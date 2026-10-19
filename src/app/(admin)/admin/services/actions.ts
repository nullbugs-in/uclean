"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/db/server";
import { serviceSchema } from "@/lib/validation";
import type { ServiceInput } from "@/lib/validation";
import { requireAdmin } from "@/server/auth";
import { DomainError } from "@/server/errors";
import {
  ServiceSettingsError,
  createService,
  deleteService,
  updateService,
} from "@/server/service-settings";

/**
 * Admin service-catalogue actions.
 *
 * Each opens with `requireAdmin()`, and the write is *also* gated by the
 * `services_admin_write` RLS policy. That is deliberate duplication: these are
 * public endpoints, and the policy is what makes a forgotten check a non-event
 * rather than a vulnerability.
 *
 * The catalogue is what invoices price from, so a save revalidates this page.
 * The public pricing pages read a static list and are not touched by it.
 */

export type ServiceActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

/** Maps a thrown error to the one line the dialog should show. */
function describeFailure(error: unknown, fallback: string, log: string): string {
  if (error instanceof ServiceSettingsError) return error.userMessage;
  if (error instanceof DomainError) return error.userMessage;

  console.error(log, error);
  return fallback;
}

export async function createServiceAction(
  input: ServiceInput,
): Promise<ServiceActionResult> {
  const parsed = serviceSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Please check the service and retry.",
    };
  }

  try {
    const admin = await requireAdmin();
    const supabase = await createClient();

    const saved = await createService(supabase, admin.profile.id, parsed.data);

    revalidatePath("/admin/services");

    return { ok: true, message: `Added ${saved.name}.` };
  } catch (error) {
    return {
      ok: false,
      message: describeFailure(
        error,
        "We could not add the service. Please try again.",
        "Could not create the service",
      ),
    };
  }
}

export async function updateServiceAction(
  id: string,
  input: ServiceInput,
): Promise<ServiceActionResult> {
  const parsed = serviceSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Please check the service and retry.",
    };
  }

  try {
    const admin = await requireAdmin();
    const supabase = await createClient();

    const saved = await updateService(supabase, admin.profile.id, id, parsed.data);

    revalidatePath("/admin/services");

    return { ok: true, message: `Saved ${saved.name}.` };
  } catch (error) {
    return {
      ok: false,
      message: describeFailure(
        error,
        "We could not save the service. Please try again.",
        "Could not update the service",
      ),
    };
  }
}

export async function deleteServiceAction(
  id: string,
): Promise<ServiceActionResult> {
  try {
    const admin = await requireAdmin();
    const supabase = await createClient();

    await deleteService(supabase, admin.profile.id, id);

    revalidatePath("/admin/services");

    return { ok: true, message: "Service deleted." };
  } catch (error) {
    return {
      ok: false,
      message: describeFailure(
        error,
        "We could not delete the service. Please try again.",
        "Could not delete the service",
      ),
    };
  }
}
