"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/db/server";
import { requireRole } from "@/server/auth";

/**
 * Notification actions for the navbar bell.
 *
 * Separate from `(public)/account/actions.ts` because these act on something
 * the customer owns but does not edit: the bell lives in the site chrome on
 * every page, not in the account area, and the action it calls sits with the
 * rest of the server-side notification code.
 */

export type MarkReadResult = { ok: true; marked: number };

export type MarkOneReadResult = { ok: true; marked: boolean };

/**
 * Marks every one of the caller's own unread messages as read.
 *
 * The write itself is the `mark_all_notifications_read()` function from
 * migration 13, called through the request-scoped client rather than the service
 * client. That is deliberate and is the security-relevant decision here: the
 * function is SECURITY DEFINER precisely so no UPDATE policy on `notifications`
 * is needed, and an UPDATE policy could not have been limited to `read_at` - it
 * would have handed the caller `status`, `attempts` and `last_error` as well,
 * which is enough to make a failed delivery look sent in the admin log.
 *
 * `requireRole` is still the gate that matters before the call: signed out,
 * `auth.uid()` is null inside the function and it would match no rows, so a
 * silent no-op is the right failure for nobody and a confusing one for an
 * attacker.
 */
export async function markAllNotificationsReadAction(): Promise<MarkReadResult> {
  // The return value is not needed; the call is the gate.
  await requireRole(["customer", "staff", "admin"]);
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("mark_all_notifications_read");

  if (error) {
    console.error("Could not mark notifications read", error);
    return { ok: true, marked: 0 };
  }

  /*
   * The badge is rendered by the site chrome, which every public page reads, so
   * refreshing the layout path is what makes the cleared count stick for anything
   * server-rendered after this - a refresh, a back navigation, or a client-side
   * transition that re-runs the layout. The bell also updates its own state
   * immediately, so the customer does not wait on this round trip to see the
   * badge clear.
   */
  revalidatePath("/", "layout");

  return { ok: true, marked: typeof data === "number" ? data : 0 };
}

/**
 * Marks one of the caller's own messages read, when they tap it in the bell.
 *
 * The write is `mark_notification_read()` from migration 14 - SECURITY DEFINER
 * for the same reason as above: an UPDATE policy could not be limited to
 * `read_at`. The function also checks `user_id = auth.uid()`, so a caller
 * cannot mark somebody else's message read by guessing an id, and it only
 * touches rows that are still unread.
 *
 * Reports failure as `{ ok: true, marked: false }` rather than `ok: false` for
 * the same reason the read-all action does: a notification that fails to clear
 * is a cosmetic problem, and a hard error would leave the customer staring at a
 * dialog over something that does not matter. The bell optimistically drops the
 * badge and this corrects it if the write did not land.
 */
export async function markNotificationReadAction(input: {
  notificationId: number;
}): Promise<MarkOneReadResult> {
  if (!Number.isInteger(input.notificationId)) {
    return { ok: true, marked: false };
  }

  // The gate that matters: signed out, `auth.uid()` is null inside the function
  // and it would match no rows, so a silent no-op is the right failure.
  await requireRole(["customer", "staff", "admin"]);
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("mark_notification_read", {
    p_notification_id: input.notificationId,
  });

  if (error) {
    console.error("Could not mark the notification read", error);
    return { ok: true, marked: false };
  }

  // Same revalidation as the read-all action: the badge lives in the chrome,
  // which every public page renders.
  revalidatePath("/", "layout");

  return { ok: true, marked: data === true };
}
