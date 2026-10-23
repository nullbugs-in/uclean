import { BillingError, deliveryChargeFor, invoiceTotal } from "@/lib/invoice";
import { siteConfig } from "@/config/site";
import { createClient, createServiceClient } from "@/db/server";
import type { Invoice } from "@/db/types";

import { issuePaymentToken } from "./billing";

/**
 * Invoices generated from the bookings cards.
 *
 * This is the booking channel's own persistence path, deliberately parallel to
 * `createInvoice` in `src/server/billing.ts` rather than a mode on it. Bookings
 * line up against the public price list (`pricing_items`/`pricing_options`),
 * and the admin who confirmed the analysis is expected to adjust what each line
 * bills — so here the line's name and unit price are submitted, validated and
 * stored as the invoice says.
 *
 * Everything else matches the billing path: the invoice is upserted with the
 * service client (one invoice per order by design, so re-generating replaces
 * rather than stacks), the order's contact fields are re-read server-side, the
 * delivery charge is computed from the store policy here and never accepted
 * from the browser, and every `order_items` row for the order is deleted and
 * re-inserted — the lines are the record of what was billed.
 */

export type BookingInvoiceLineInput = {
  /** The price-list name as it should appear on the bill. */
  name: string;
  qty: number;
  /** The final unit price the admin confirmed. */
  unitPrice: number;
};

export type BookingInvoiceDraft = {
  orderId: string;
  actorId: string | null;
  lines: BookingInvoiceLineInput[];
  /** The analysis findings confirmed in the invoice form, or nothing. */
  feedback?: string | null;
};

export async function createBookingInvoice(
  draft: BookingInvoiceDraft,
): Promise<Invoice> {
  if (draft.lines.length === 0) {
    throw new BillingError(
      "booking invoice created with no lines",
      "Add at least one service before generating the invoice.",
    );
  }

  const supabase = await createClient();

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("customer_name, customer_mobile, address_snapshot")
    .eq("id", draft.orderId)
    .maybeSingle();

  if (orderError) throw new Error(orderError.message);
  if (!order) throw new Error("Order not found");

  const subtotal = draft.lines.reduce(
    (sum, line) => sum + line.qty * line.unitPrice,
    0,
  );

  const deliveryCharge = deliveryChargeFor(subtotal, siteConfig.deliveryPolicy);
  const total = invoiceTotal({
    subtotal,
    tax: 0,
    deliveryCharge,
    discount: 0,
  });

  const service = createServiceClient();

  const { data: invoice, error } = await service
    .from("invoices")
    .upsert(
      {
        order_id: draft.orderId,
        customer_name: order.customer_name,
        customer_mobile: order.customer_mobile,
        billing_address: order.address_snapshot,
        subtotal,
        tax: 0,
        discount: 0,
        delivery_charge: deliveryCharge,
        total,
        status: "draft",
        analysis_note: draft.feedback || null,
        created_by: draft.actorId ?? null,
      },
      { onConflict: "order_id" },
    )
    .select()
    .single();

  if (error) throw new Error(error.message);

  const { error: itemError } = await service
    .from("order_items")
    .delete()
    .eq("order_id", draft.orderId);
  if (itemError) throw new Error(itemError.message);

  const { error: insertError } = await service.from("order_items").insert(
    draft.lines.map((line) => ({
      order_id: draft.orderId,
      item_name: line.name,
      qty: line.qty,
      unit_price: line.unitPrice,
    })),
  );
  if (insertError) throw new Error(insertError.message);

  return invoice;
}

export type SentBookingInvoice = {
  invoiceNo: string;
  /** The signed, expiring /pay/{token} link handed to customer and staff. */
  payUrl: string;
  /** Whether a fresh token had to be minted rather than reusing the stored one. */
  reissued: boolean;
};

/**
 * Marks a booking's invoice sent and readies the customer and staff links.
 *
 * The secure link is the same signed, expiring one `/pay/[token]` resolves, so
 * reuse is preferred: re-minting a token on every press would invalidate the
 * link already on the customer's booking card. A fresh one is issued only when
 * none is stored or the stored expiry has passed.
 *
 * Exactly one WhatsApp message is prepared per invoice. The stage change on
 * generation already queued an `invoice_ready` row through the status trigger;
 * sending merges the pay link, amount and invoice id into that queued row
 * rather than stacking a second message behind it. Nothing is sent from here —
 * the queue worker is the only sender, and until a provider is configured its
 * rows stay queued, which is the truth rather than a claim of delivery.
 */
export async function sendBookingInvoice(
  orderId: string,
): Promise<SentBookingInvoice> {
  const supabase = await createClient();

  const { data: invoice, error } = await supabase
    .from("invoices")
    .select("id, invoice_no, total, status, pay_token, pay_token_expires_at")
    .eq("order_id", orderId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!invoice) {
    throw new BillingError(
      "send before generation",
      "Generate the invoice before sending it to the customer.",
    );
  }
  if (invoice.status === "paid") {
    throw new BillingError(
      "send after paid",
      "This invoice has already been collected, so there is nothing left to send.",
    );
  }
  if (invoice.status === "void") {
    throw new BillingError(
      "send after void",
      "This invoice was voided and can no longer be sent.",
    );
  }

  const storedExpiry = invoice.pay_token_expires_at
    ? new Date(invoice.pay_token_expires_at).getTime()
    : 0;
  const reissued = !invoice.pay_token || storedExpiry < Date.now();

  const { token } = reissued
    ? await issuePaymentToken(invoice.id)
    : { token: invoice.pay_token! };

  const service = createServiceClient();

  const { data: sent, error: sentError } = await service
    .from("invoices")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", invoice.id)
    .select("order_id, total, customer_name")
    .single();

  if (sentError) throw new Error(sentError.message);

  const payUrl = `/pay/${token}`;

  /*
   * The queued message from the generation stage carries no link (the token is
   * minted after it). Attach the link there if that row is still queued so the
   * customer gets one WhatsApp message with the link, not two — and mint a row
   * instead when the stage move happened outside this card's flow.
   */
  const { data: queued } = await service
    .from("notifications")
    .select("id, payload")
    .eq("order_id", orderId)
    .eq("template", "invoice_ready")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1);

  if (queued && queued.length > 0) {
    const existing = queued[0]!;
    const base =
      existing.payload && typeof existing.payload === "object"
        ? (existing.payload as Record<string, unknown>)
        : {};

    const { error: linkError } = await service
      .from("notifications")
      .update({
        payload: {
          ...base,
          invoice_id: invoice.id,
          amount: sent.total,
          pay_url: payUrl,
        },
      })
      .eq("id", existing.id);

    if (linkError) throw new Error(linkError.message);
  } else {
    const { error: insertError } = await service.from("notifications").insert({
      user_id: null,
      channel: "whatsapp",
      template: "invoice_ready",
      invoice_id: invoice.id,
      order_id: sent.order_id,
      payload: {
        invoice_id: invoice.id,
        amount: sent.total,
        pay_url: payUrl,
        order_no: sent.order_id,
      },
    });

    if (insertError) throw new Error(insertError.message);
  }

  return { invoiceNo: invoice.invoice_no, payUrl, reissued };
}
