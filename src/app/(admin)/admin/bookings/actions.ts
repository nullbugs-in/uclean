"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { invoiceSchema, type InvoiceInput } from "@/lib/validation";
import { requireAdmin } from "@/server/auth";
import { createClient } from "@/db/server";
import {
  advanceOrderStatusForCurrentUser,
  toOrderEditMessage,
  updateOrderItemsForCurrentUser,
  type OrderItemDraft,
} from "@/server/admin-orders";
import { assignPickupAgent } from "@/server/admin-pickups";
import { createInvoice } from "@/server/billing";
import { BillingError } from "@/lib/invoice";

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

/**
 * A generated invoice shows up on Billing — which lists it — and on the staff
 * bill list, so those are re-read alongside everything the stage change touches.
 */
function revalidateInvoiceViews(orderId: string) {
  revalidateBookingViews(orderId);
  revalidatePath("/admin/billing");
  revalidatePath("/staff/bills");
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

// ---------------------------------------------------------------------------
// Analysis completion and invoice generation
// ---------------------------------------------------------------------------

/**
 * Generates the invoice for a booking the analysis has been completed on, and
 * records it on the booking's timeline.
 *
 * This is invoicing with a schedule attached: the card offers the button only
 * once the booking sits at `under_analysis`, so the action repeats that gate —
 * plus the "nothing billed yet" rule — so it is safe against any caller, not
 * just the card that constrained itself. The database remains the authority:
 * the `under_analysis → invoice_sent` move goes through the same
 * expected-status transition the stage buttons use, which appends the timeline
 * row, the audit entry and the customer's WhatsApp message.
 *
 * Order of operations matters. The invoice is created before the stage moves;
 * if the stage move then fails (a colleague moved the booking in between),
 * the invoice exists and is re-reportable as a success with a caveat — the
 * retry path would otherwise hit "an invoice already exists" and look broken.
 */
export async function generateBookingInvoiceAction(
  input: InvoiceInput,
): Promise<AdminBookingResult> {
  const parsed = invoiceSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Check the invoice and try again.",
    };
  }

  try {
    const admin = await requireAdmin();
    const orderId = parsed.data.orderId;
    const client = await createClient();

    const [orderResult, invoiceResult] = await Promise.all([
      client.from("orders").select("status").eq("id", orderId).maybeSingle(),
      client
        .from("invoices")
        .select("id")
        .eq("order_id", orderId)
        .maybeSingle(),
    ]);

    if (orderResult.error) throw new Error(orderResult.error.message);
    if (invoiceResult.error) throw new Error(invoiceResult.error.message);

    if (!orderResult.data) {
      return { ok: false, message: "That booking could not be found." };
    }

    if (invoiceResult.data) {
      return {
        ok: false,
        message: "An invoice already exists for this booking.",
      };
    }

    if (orderResult.data.status !== "under_analysis") {
      return {
        ok: false,
        message: "Complete the analysis before generating the invoice.",
      };
    }

    const invoice = await createInvoice({
      orderId,
      items: parsed.data.items.map((item) => ({
        serviceId: item.serviceId,
        qty: item.qty,
        notes: item.notes || null,
        photoUrl: item.photoUrl || null,
      })),
      tax: parsed.data.tax,
      discount: parsed.data.discount,
      deliveryCharge: parsed.data.deliveryCharge,
      createdBy: admin.profile.id,
    });

    /*
     * Best effort: the invoice is saved and is the money record, so a stage
     * conflict must not hide it behind an error. The warning tells the admin
     * the stage did not follow and that the stage buttons can finish the move.
     */
    let stageWarning: string | undefined;

    try {
      await advanceOrderStatusForCurrentUser({
        orderId,
        to: "invoice_sent",
        expectedStatus: "under_analysis",
        note: `Invoice ${invoice.invoice_no} generated`,
        reason: null,
      });
    } catch (stageError) {
      console.error("Could not record the invoice stage", stageError);
      stageWarning = `${invoice.invoice_no} was generated, but updating the stage failed: ${toOrderEditMessage(stageError)}`;
    }

    revalidateInvoiceViews(orderId);

    return {
      ok: true,
      message: `${invoice.invoice_no} generated.`,
      warning: stageWarning,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof BillingError
          ? error.userMessage
          : toOrderEditMessage(error),
    };
  }
}

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
