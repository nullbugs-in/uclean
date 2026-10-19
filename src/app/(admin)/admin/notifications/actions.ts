"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/db/server";
import { requireAdmin } from "@/server/auth";

/**
 * Admin notification actions (section 8.7).
 *
 * There is exactly one, because the log is read-only by design: the queue is
 * drained by the cron worker, and letting an admin edit a message that is on its
 * way out would mean editing what a customer receives.
 *
 * Written through the request client, which works because
 * `notifications_admin_update` exists - unlike `invoices_admin_write`, which is
 * an admin-only write with no client path at all. So `requireAdmin()` is the
 * gate, and the policy behind it is the second one.
 */

export type NotificationActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

/**
 * Puts a failed message back on the queue.
 *
 * The status guard is the whole safety: only a message the worker has already
 * given up on can be requeued, so this cannot yank one out of the worker's hands
 * while it is being sent, and a second click cannot produce a third copy of
 * something that already went out.
 */
export async function retryNotificationAction(input: {
  id: number;
}): Promise<NotificationActionResult> {
  const parsed = z.object({ id: z.number().int().positive() }).safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "That message could not be requeued." };
  }

  try {
    await requireAdmin();

    const client = await createClient();

    const { data, error } = await client
      .from("notifications")
      .update({
        status: "queued",
        next_attempt_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", parsed.data.id)
      .eq("status", "failed")
      .select("id");

    if (error) throw new Error(error.message);

    if (!data || data.length === 0) {
      return {
        ok: false,
        message: "That message is no longer waiting to be retried.",
      };
    }

    revalidatePath("/admin/notifications");

    return {
      ok: true,
      message: "Queued again. The next cron run picks it up.",
    };
  } catch (error) {
    console.error("Could not requeue the notification", error);
    return {
      ok: false,
      message: "We could not requeue that message. Please try again shortly.",
    };
  }
}
