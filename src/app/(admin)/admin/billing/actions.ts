"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { invoiceSchema } from "@/lib/validation";
import type { InvoiceInput } from "@/lib/validation";
import { requireAdmin } from "@/server/auth";
import {
  BillingError,
  createInvoice,
  recordCashOnDelivery,
  sendInvoice,
} from "@/server/billing";
import { DomainError } from "@/server/errors";

/**
 * Admin billing actions.
 *
 * Each opens with `requireAdmin()`, and the write is *also* gated by the RLS
 * policies on `invoices`, `order_items` and `payments`. `createInvoice` and
 * `sendInvoice` use the service role for the rows that have no insert policy of
 * their own, which is exactly why the check here is load-bearing rather than
 * ceremonial.
 *
 * Generating or sending an invoice changes money, so it revalidates the
 * dashboard and the staff bill list as well as this page.
 */

export type BillingActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

/** Maps a thrown error to the one line the page should show. */
function describeFailure(
  error: unknown,
  fallback: string,
  log: string,
): string {
  if (error instanceof BillingError) return error.userMessage;
  if (error instanceof DomainError) return error.userMessage;

  console.error(log, error);
  return fallback;
}

function revalidateBillingViews(orderId: string) {
  revalidatePath("/admin/billing");
  revalidatePath(`/admin/bookings/${orderId}`);
  revalidatePath("/admin");
  revalidatePath("/staff/bills");
}

/**
 * Generates (or regenerates) the invoice for an order from catalogue lines.
 *
 * The prices are not sent and not accepted: `createInvoice` reads them from
 * `services`, so this only forwards service ids and quantities.
 */
export async function generateInvoiceAction(
  input: InvoiceInput,
): Promise<BillingActionResult> {
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

    const invoice = await createInvoice({
      orderId: parsed.data.orderId,
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

    revalidateBillingViews(parsed.data.orderId);

    return { ok: true, message: `${invoice.invoice_no} generated.` };
  } catch (error) {
    return {
      ok: false,
      message: describeFailure(
        error,
        "We could not generate the invoice. Please try again.",
        "Could not generate the invoice",
      ),
    };
  }
}

const invoiceRefSchema = z.object({
  invoiceId: z.string().uuid(),
  orderId: z.string().uuid(),
});

/** Issues a fresh payment link and queues the WhatsApp invoice message. */
export async function sendInvoiceAction(input: {
  invoiceId: string;
  orderId: string;
}): Promise<BillingActionResult> {
  const parsed = invoiceRefSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "That invoice could not be found." };
  }

  try {
    await requireAdmin();

    await sendInvoice(parsed.data.invoiceId);

    revalidateBillingViews(parsed.data.orderId);

    return {
      ok: true,
      message: "Invoice sent. The customer has a payment link.",
    };
  } catch (error) {
    return {
      ok: false,
      message: describeFailure(
        error,
        "We could not send the invoice. Please try again.",
        "Could not send the invoice",
      ),
    };
  }
}

/** Records Cash on Delivery for an invoice and marks it paid (section 6.4). */
export async function recordCodAction(input: {
  invoiceId: string;
  orderId: string;
  amount: number;
}): Promise<BillingActionResult> {
  const parsed = invoiceRefSchema
    .extend({ amount: z.coerce.number().positive("Enter the amount collected") })
    .safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Enter the amount collected.",
    };
  }

  try {
    const admin = await requireAdmin();

    await recordCashOnDelivery(
      parsed.data.invoiceId,
      parsed.data.amount,
      admin.profile.id,
    );

    revalidateBillingViews(parsed.data.orderId);

    return {
      ok: true,
      message: "Cash on delivery recorded. The invoice is marked paid.",
    };
  } catch (error) {
    return {
      ok: false,
      message: describeFailure(
        error,
        "We could not record the payment. Please try again.",
        "Could not record the cash on delivery",
      ),
    };
  }
}
