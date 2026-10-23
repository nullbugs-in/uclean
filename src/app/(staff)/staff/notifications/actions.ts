"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/db/server";
import { requireStaff } from "@/server/auth";

/**
 * Notification actions for the staff panel bell.
 *
 * Separate from the customer bell's `(public)/notifications/actions.ts`
 * because the two bell functions act on different tables: the customer bell
 * marks its WhatsApp queue entries, this one marks `staff_notifications`
 * (migration 22), and the functions look identical only up to the table name.
 */
export type MarkReadResult = { ok: true; marked: number };

export type MarkOneReadResult = { ok: true; marked: boolean };

/**
 * Marks every one of the caller's own unread staff notifications as read,
 * clearing the bell's badge.
 *
 * The write is the `mark_all_staff_notifications_read()` function from
 * migration 22, called through the request-scoped client rather than the
 * service client. The function is SECURITY DEFINER precisely so no UPDATE
 * policy on `staff_notifications` is needed; `requireStaff` is the gate that
 * matters before the call, because signed-out there is no `auth.uid()` and the
 * function would silently match no rows.
 */
export async function markAllStaffNotificationsReadAction(): Promise<MarkReadResult> {
  // The return value is not needed; the call is the gate.
  await requireStaff();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc(
    "mark_all_staff_notifications_read",
  );

  if (error) {
    console.error("Could not mark staff notifications read", error);
    return { ok: true, marked: 0 };
  }

  /*
   * The badge lives in the staff panel chrome (`(staff)/layout.tsx`, via the
   * topbar), so refreshing the layout path is what makes the cleared count
   * stick for anything server-rendered after this. The bell also updates its
   * own state immediately, so the staff member does not wait on this round
   * trip to see the badge clear.
   */
  revalidatePath("/staff", "layout");

  return { ok: true, marked: typeof data === "number" ? data : 0 };
}

/**
 * Marks one of the caller's own staff notifications read, when they tap it in
 * the bell.
 *
 * The write is `mark_staff_notification_read()` from migration 22, which also
 * checks `user_id = auth.uid()`, so a caller cannot mark somebody else's
 * notification read by guessing an id, and it only touches rows that are still
 * unread. Cosmetic failures stay `{ ok: true, marked: false }` for the same
 * reason as the read-all action: a notification that fails to clear does not
 * matter enough to interrupt the staff member's work.
 */
export async function markStaffNotificationReadAction(input: {
  notificationId: number;
}): Promise<MarkOneReadResult> {
  if (!Number.isInteger(input.notificationId)) {
    return { ok: true, marked: false };
  }

  await requireStaff();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("mark_staff_notification_read", {
    p_notification_id: input.notificationId,
  });

  if (error) {
    console.error("Could not mark the staff notification read", error);
    return { ok: true, marked: false };
  }

  // Same revalidation as the read-all action: the badge lives in the chrome,
  // which every staff page renders.
  revalidatePath("/staff", "layout");

  return { ok: true, marked: data === true };
}
