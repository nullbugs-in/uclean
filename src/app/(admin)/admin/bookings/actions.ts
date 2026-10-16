"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/server/auth";
import { createClient } from "@/db/server";
import {
  advanceOrderStatusForCurrentUser,
  toOrderEditMessage,
  updateOrderItemsForCurrentUser,
  type OrderItemDraft,
} from "@/server/admin-orders";
import { assignPickupAgent } from "@/server/admin-pickups";

/**
 * Admin booking actions.
 *
 * Every one opens with `requireAdmin()`, and that is load-bearing rather than
 * ceremonial. The status update goes through `admin_change_order_status`, which
 * is SECURITY DEFINER, and the item write relies on `order_items_staff_write`,
 * which also permits ordinary staff holding an assignment. This check is the
 * layer that says "admin panel" specifically.
 *
 * This module is about process. There is no billing here: an admin moves the
 * booking through the stages the database allows and records why, and that is
 * the whole job. Prices and invoices are handled elsewhere.
 */

export type AdminBookingResult =
  | { ok: true; message?: string; warning?: string }
  | { ok: false; message: string };

/**
 * The customer's tracking timeline, the order counts on the dashboard, the
 * summary cards here and the staff list all read from the same rows this changes,
 * so all of them have to be re-read rather than only the page that was pressed.
 */
function revalidateBookingViews(orderId: string) {
  revalidatePath(`/admin/bookings/${orderId}`);
  revalidatePath("/admin/bookings");
  revalidatePath("/admin");
  revalidatePath("/admin/pickups");
  revalidatePath("/admin/deliveries");
  revalidatePath("/account/orders");
}

const orderIdSchema = z.string().uuid("That booking could not be found");

const statusSchema = z.enum([
  "pickup_requested",
  "agent_assigned",
  "picked_up",
  "under_analysis",
  "invoice_sent",
  "payment_pending",
  "paid",
  "in_process",
  "ready_for_delivery",
  "out_for_delivery",
  "delivered",
  "cancelled",
]);

/**
 * Moves a booking to a status the state machine allows, recording an optional
 * internal note.
 *
 * `expectedStatus` is required, not optional. It is what lets the database detect
 * that another admin moved this booking while this page was open, and turn the
 * silent overwrite into a "reload it" message.
 *
 * A cancellation is the one transition where a free-text field is mandatory,
 * because "why was this cancelled" is a question the record has to answer later.
 */
export async function updateOrderStatusAction(input: {
  orderId: string;
  next: string;
  expectedStatus: string;
  note?: string;
  reason?: string;
}): Promise<AdminBookingResult> {
  const parsed = z
    .object({
      orderId: orderIdSchema,
      next: statusSchema,
      expectedStatus: statusSchema,
      note: z.string().max(500).optional(),
      reason: z.string().max(500).optional(),
    })
    .safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "That status change is not available." };
  }

  const cancelling = parsed.data.next === "cancelled";

  if (cancelling && !parsed.data.reason?.trim()) {
    return {
      ok: false,
      message: "Give a reason for the cancellation before confirming.",
    };
  }

  try {
    await requireAdmin();

    const result = await advanceOrderStatusForCurrentUser({
      orderId: parsed.data.orderId,
      to: parsed.data.next,
      expectedStatus: parsed.data.expectedStatus,
      note: parsed.data.note ?? null,
      reason: cancelling ? (parsed.data.reason ?? null) : null,
    });

    revalidateBookingViews(parsed.data.orderId);

    return {
      ok: true,
      message: "Stage updated.",
      /*
       * The stage genuinely changed; only the note did not survive, which
       * happens when the database is running without the process-note migration.
       * Reporting it as a failure would be wrong and would invite a retry that
       * hits a conflict, so it is a success carrying a caveat.
       */
      warning: result.noteDropped
        ? "The stage was updated, but the note was not saved. Stage notes are unavailable on this database."
        : undefined,
    };
  } catch (error) {
    return { ok: false, message: toOrderEditMessage(error) };
  }
}

const itemDraftSchema = z.object({
  id: z.string().uuid(),
  qty: z.coerce.number().positive().max(999),
  unitPrice: z.coerce.number().min(0).max(1_000_000),
});

/**
 * Saves the adjusted quantities and rates on a booking's lines.
 *
 * The invoice and closed-booking guards live in `updateOrderItems`, not here, so
 * they apply no matter which caller reaches the write.
 */
export async function updateOrderItemsAction(input: {
  orderId: string;
  items: OrderItemDraft[];
}): Promise<AdminBookingResult> {
  const parsed = z
    .object({
      orderId: orderIdSchema,
      items: z.array(itemDraftSchema).max(100),
    })
    .safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Check the lines and try again.",
    };
  }

  try {
    await requireAdmin();

    await updateOrderItemsForCurrentUser(
      parsed.data.orderId,
      parsed.data.items,
    );

    revalidateBookingViews(parsed.data.orderId);

    return {
      ok: true,
      message: "Saved.",
    };
  } catch (error) {
    return { ok: false, message: toOrderEditMessage(error) };
  }
}

// ---------------------------------------------------------------------------
// Agent assignment
// ---------------------------------------------------------------------------

/**
 * Puts an agent on the pickup or the delivery.
 *
 * `requireAdmin()` is the only gate here, because the write goes through the
 * service client: there is no policy that would let an admin's own session do
 * this, and no policy is widened to make the UI work.
 *
 * Reassignment is the same call rather than a separate path, so the admin's
 * choice of a different agent leaves one owner and one audit row recording what
 * it replaced.
 */
export async function assignBookingAgentAction(input: {
  orderId: string;
  agentId: string;
  kind: "pickup" | "delivery";
}): Promise<AdminBookingResult> {
  const parsed = z
    .object({
      orderId: orderIdSchema,
      agentId: z.string().uuid("Choose an agent first."),
      kind: z.enum(["pickup", "delivery"]),
    })
    .safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Choose an agent first.",
    };
  }

  try {
    await requireAdmin();

    const client = await createClient();
    const { data: userData } = await client.auth.getUser();
    const actorId = userData.user?.id;

    if (!actorId) {
      return { ok: false, message: "You need to sign in again." };
    }

    const result = await assignPickupAgent(
      parsed.data.orderId,
      parsed.data.agentId,
      actorId,
      parsed.data.kind,
    );

    revalidateBookingViews(parsed.data.orderId);

    return {
      ok: true,
      message: `${result.agentName} is now on the ${parsed.data.kind}.`,
    };
  } catch (error) {
    return { ok: false, message: toOrderEditMessage(error) };
  }
}
