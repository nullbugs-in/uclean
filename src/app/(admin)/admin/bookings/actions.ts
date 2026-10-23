"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { BillingError } from "@/lib/invoice";
import type { OrderStatus } from "@/lib/order-status";
import { requireAdmin } from "@/server/auth";
import { createClient } from "@/db/server";
import {
  advanceOrderStatusForCurrentUser,
  toOrderEditMessage,
  updateOrderItemsForCurrentUser,
  type OrderItemDraft,
} from "@/server/admin-orders";
import { assignPickupAgent } from "@/server/admin-pickups";
import {
  createBookingInvoice,
  sendBookingInvoice,
} from "@/server/admin-booking-invoice";
import { issuePaymentToken } from "@/server/billing";

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
  | {
      ok: true;
      message?: string;
      warning?: string;
      /** Set when the action produced a secure /pay/{token} link. */
      payUrl?: string;
      /** The invoice number the action acted on, when one exists. */
      invoiceNo?: string;
    }
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
  /*
   * The staff panel reads the same rows this changes — the assigned agent's
   * order list and the delivery queue show the stage and the state the card
   * action moved the booking to — so they are re-read alongside everything
   * else rather than waiting for the next navigation.
   */
  revalidatePath("/staff");
  revalidatePath("/staff/orders");
  revalidatePath("/staff/deliveries");
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

// ---------------------------------------------------------------------------
// Marking a paid booking ready for delivery
// ---------------------------------------------------------------------------

/**
 * The single hops that carry a booking to `ready_for_delivery`.
 *
 * The laundry is only ready once the money is confirmed, and payment can be
 * confirmed (Billing marks the invoice `paid`) while the booking still stands
 * at `invoice_sent`, `payment_pending` or earlier — cash on delivery never
 * touches the order row on its own. Rather than asking the admin to click
 * through "Payment Received" and "Processing Complete" first, the ready path
 * walks the intermediate hops the state machine already allows, recording an
 * honest note for each so the timeline and the status log tell exactly how the
 * booking got here.
 */
const HOP_TO_READY: Partial<Record<OrderStatus, OrderStatus>> = {
  under_analysis: "in_process",
  invoice_sent: "paid",
  payment_pending: "paid",
  paid: "ready_for_delivery",
  in_process: "ready_for_delivery",
};

const ALREADY_READY = new Set([
  "ready_for_delivery",
  "out_for_delivery",
  "delivered",
]);

/** Which note a hop carries, one that will still make sense much later. */
function hopNote(to: OrderStatus): string {
  return to === "paid"
    ? "Payment confirmed — invoice marked paid."
    : "Laundry processing complete — marked ready for delivery.";
}

/**
 * Marks the laundry ready for delivery from a booking card.
 *
 * The gate on the card only opens the button once the invoice reads `paid` —
 * the Billing module is what confirms payment, and the shop's rule is that
 * nothing moves to the delivery queue on an unpaid invoice — and this action
 * repeats that check against the row itself before doing anything, so it is
 * safe against any caller, not just the card that constrained itself.
 *
 * `expectedStatus` is the card's view of the booking's stage. If it disagrees
 * with the row — a colleague moved the booking while the page sat open — the
 * action refuses with a reload message instead of walking the machine from
 * somewhere the admin did not think it was. From there each hop re-checks the
 * state through the same `expected-status` transition the stage buttons use,
 * so a race during the walk surfaces as an error too.
 *
 * The payment hop queues the customer's payment-received WhatsApp exactly the
 * way the stage buttons would; the ready hop sends no message (matching the
 * SQL template mapping), but the timeline history this writes is the signal —
 * the staff page and the customer's tracker both update from the same rows.
 */
export async function markBookingReadyAction(input: {
  orderId: string;
  expectedStatus: string;
}): Promise<AdminBookingResult> {
  const parsed = z
    .object({
      orderId: orderIdSchema,
      expectedStatus: statusSchema,
    })
    .safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "That booking could not be found." };
  }

  try {
    await requireAdmin();

    const client = await createClient();
    const [orderResult, invoiceResult] = await Promise.all([
      client
        .from("orders")
        .select("status")
        .eq("id", parsed.data.orderId)
        .maybeSingle(),
      client
        .from("invoices")
        .select("status")
        .eq("order_id", parsed.data.orderId)
        .maybeSingle(),
    ]);

    if (orderResult.error) throw new Error(orderResult.error.message);
    if (invoiceResult.error) throw new Error(invoiceResult.error.message);

    if (!orderResult.data) {
      return { ok: false, message: "That booking could not be found." };
    }

    if (invoiceResult.data?.status !== "paid") {
      return {
        ok: false,
        message:
          "The payment is not confirmed yet. Confirm it in Billing first.",
      };
    }

    if (orderResult.data.status !== parsed.data.expectedStatus) {
      return {
        ok: false,
        message:
          "This booking moved while you were looking at it. Reload and try again.",
      };
    }

    const current = orderResult.data.status as OrderStatus;

    if (current === "cancelled") {
      return { ok: false, message: "This booking was cancelled." };
    }

    if (ALREADY_READY.has(current)) {
      return {
        ok: true,
        message: "This booking is already ready for delivery.",
      };
    }

    const hop = async (from: OrderStatus, to: OrderStatus) => {
      await advanceOrderStatusForCurrentUser({
        orderId: parsed.data.orderId,
        to,
        expectedStatus: from,
        note: hopNote(to),
        reason: null,
      });
    };

    let stage: OrderStatus | undefined = current;
    for (;;) {
      if (!stage) break;

      const to: OrderStatus | undefined = HOP_TO_READY[stage];
      if (!to) break;

      await hop(stage, to);

      stage = to;
    }

    /*
     * Invoicing normally moves the booking to `invoice_sent`, so a paid
     * invoice always has hops available. If a booking somehow sits before
     * that (a manual path through Billing), say so rather than quietly
     * changing nothing.
     */
    if (stage && !ALREADY_READY.has(stage)) {
      return {
        ok: false,
        message:
          "This booking is still before the invoice stage. Move it through the analysis first.",
      };
    }

    revalidateBookingViews(parsed.data.orderId);

    return { ok: true, message: "The laundry is ready for delivery." };
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
 * One line on the booking invoice.
 *
 * The price list the cards invoice from is not the catalogue: online bookings
 * carry the public price list's items (`src/data/pricing.ts`) and no `services`
 * id, so the line is a name and a final unit price rather than a service
 * reference. The name and price caps match what a booking line is allowed to
 * carry, and the price cap matches the item editor's cap.
 */
const bookingInvoiceItemSchema = z.object({
  name: z.string().trim().min(1, "Name each service").max(160),
  qty: z.coerce
    .number()
    .positive("Quantity must be more than zero")
    .max(99, "Quantity must be at most 99"),
  unitPrice: z.coerce
    .number()
    .min(0, "Amount cannot be negative")
    .max(1_000_000, "Amount cannot be more than ₹10,00,000"),
});

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
 * What the browser sends is deliberately narrow. Each line is a name and a
 * final unit price the admin edited (capped above), because the store's rule
 * here is that the admin confirms what washing requires — but the delivery
 * charge is *not* one of the inputs: it is derived server-side from the
 * subtotal by the store policy, and the confirmed findings ride along as
 * `analysis_note`. Tax and discount are not fields on this channel.
 *
 * Order of operations matters. The invoice is created before the stage moves;
 * if the stage move then fails (a colleague moved the booking in between),
 * the invoice exists and is re-reportable as a success with a caveat — the
 * retry path would otherwise hit "an invoice already exists" and look broken.
 */
export async function generateBookingInvoiceAction(input: {
  orderId: string;
  items: Array<{
    name: string;
    qty: number;
    unitPrice: number;
  }>;
  feedback?: string;
}): Promise<AdminBookingResult> {
  const parsed = z
    .object({
      orderId: orderIdSchema,
      items: z
        .array(bookingInvoiceItemSchema)
        .min(1, "Add at least one service")
        .max(30, "Too many services on one invoice"),
      feedback: z.string().trim().max(500).optional().or(z.literal("")),
    })
    .safeParse(input);

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

    const invoice = await createBookingInvoice({
      orderId,
      actorId: admin.profile.id,
      lines: parsed.data.items.map((item) => ({
        name: item.name,
        qty: item.qty,
        unitPrice: item.unitPrice,
      })),
      feedback: parsed.data.feedback || null,
    });

    /*
     * The secure invoice link is minted here, at generation, so it exists for
     * the specific booking from the moment the invoice does: the dialog offers
     * it to copy, and sending to the customer later reuses it rather than
     * minting a second link that would strand anyone already holding the first.
     * Best effort — a failed issuance is a warning, not a lost invoice: the
     * send step can still mint it.
     */
    let payUrl: string | undefined;
    let linkWarning: string | undefined;

    try {
      const { token } = await issuePaymentToken(invoice.id);
      payUrl = `/pay/${token}`;
    } catch (linkError) {
      console.error("Could not issue the invoice payment link", linkError);
      linkWarning =
        "The invoice saved, but its secure link could not be issued. The send step will retry that.";
    }

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

    const combinedWarning = [stageWarning, linkWarning]
      .filter(Boolean)
      .join(" ");

    return {
      ok: true,
      message: `${invoice.invoice_no} generated.`,
      warning: combinedWarning || undefined,
      payUrl,
      invoiceNo: invoice.invoice_no,
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
 * Sends a generated invoice to the customer from the booking card.
 *
 * This is the second of the two steps: generation made the invoice and its
 * secure link, and this is what the customer experiences — the invoice is
 * marked sent, the same signed link stays live, it appears on the customer's
 * booking card, and the WhatsApp message that carries the link is prepared in
 * the notifications queue.
 *
 * No message goes out here. The queue worker is the only sender, and until a
 * WhatsApp provider is configured the rows stay queued — that is reported as
 * "queued", which is exactly what it is, rather than a claim of delivery.
 */
export async function sendBookingInvoiceAction(input: {
  orderId: string;
}): Promise<AdminBookingResult> {
  const parsed = z.object({ orderId: orderIdSchema }).safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "That booking could not be found." };
  }

  try {
    await requireAdmin();

    const sent = await sendBookingInvoice(parsed.data.orderId);

    revalidateInvoiceViews(parsed.data.orderId);

    return {
      ok: true,
      message: `${sent.invoiceNo} sent to the customer. The WhatsApp message is queued for delivery.`,
      payUrl: sent.payUrl,
      invoiceNo: sent.invoiceNo,
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
