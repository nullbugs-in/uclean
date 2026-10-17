import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { createClient, createServiceClient } from "@/db/server";
import type { Invoice } from "@/db/types";
import { BillingError, invoiceTotal, priceInvoiceLines } from "@/lib/invoice";
import type { InvoiceLineInput } from "@/lib/invoice";

import { invalidPaymentToken, paymentLinkExpired } from "./errors";
import { paymentTokenSecret } from "./env";

export { BillingError } from "@/lib/invoice";
export type { InvoiceLineInput } from "@/lib/invoice";

export type InvoiceDraft = {
  orderId: string;
  items: InvoiceLineInput[];
  tax: number;
  discount: number;
  deliveryCharge: number;
  /** Who generated the invoice, for the record. */
  createdBy?: string | null;
};

/** How long a WhatsApp payment link stays usable. */
export const PAY_LINK_TTL_DAYS = 7;

/**
 * Creates or regenerates the invoice for an order.
 *
 * The price of every line is read from `services` here, never accepted from the
 * caller (section 8.4). `invoices.order_id` is unique, so re-generating replaces
 * the previous draft and its lines rather than stacking a second invoice on the
 * order.
 *
 * The subtotal is summed from the derived prices and the total is worked out
 * server side, so the numbers the customer is shown are the ones the server
 * computed and not the ones the browser sent.
 */
export async function createInvoice(draft: InvoiceDraft): Promise<Invoice> {
  if (draft.items.length === 0) {
    throw new BillingError(
      "invoice created with no lines",
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

  // One read for every distinct service on the draft. The catalogue is the
  // authority, so each line is priced from the row it names.
  const serviceIds = [...new Set(draft.items.map((item) => item.serviceId))];

  const { data: services, error: servicesError } = await supabase
    .from("services")
    .select("id, name, price, is_active")
    .in("id", serviceIds);

  if (servicesError) throw new Error(servicesError.message);

  const { lines, subtotal } = priceInvoiceLines(
    draft.orderId,
    draft.items,
    services ?? [],
  );
  const total = invoiceTotal({
    subtotal,
    tax: draft.tax,
    deliveryCharge: draft.deliveryCharge,
    discount: draft.discount,
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
        tax: draft.tax,
        discount: draft.discount,
        delivery_charge: draft.deliveryCharge,
        total,
        status: "draft",
        created_by: draft.createdBy ?? null,
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

  const { error: insertError } = await service
    .from("order_items")
    .insert(lines);
  if (insertError) throw new Error(insertError.message);

  return invoice;
}

/**
 * Issues the signed, expiring payment token used by /pay/[token].
 *
 * Format: <random nonce>.<expiry epoch>.<hmac>. The nonce is long random bytes
 * rather than something guessable like the invoice id, so enumerating invoices
 * does not enumerate payment links (section 12). The HMAC means a tampered or
 * fabricated token fails verification without a database round trip, and the
 * expiry is inside the signed payload so it cannot be extended by editing the
 * URL.
 */
export async function issuePaymentToken(invoiceId: string): Promise<{
  token: string;
  expiresAt: Date;
}> {
  const nonce = randomBytes(24).toString("base64url");
  const expiresAt = new Date(
    Date.now() + PAY_LINK_TTL_DAYS * 24 * 60 * 60 * 1000,
  );
  const expiresEpoch = Math.floor(expiresAt.getTime() / 1000);

  const payload = `${nonce}.${expiresEpoch}`;
  const signature = sign(payload, paymentTokenSecret());
  const token = `${payload}.${signature}`;

  const service = createServiceClient();

  const { error } = await service
    .from("invoices")
    .update({
      pay_token: token,
      pay_token_expires_at: expiresAt.toISOString(),
    })
    .eq("id", invoiceId);

  if (error) throw new Error(error.message);

  return { token, expiresAt };
}

/**
 * Resolves a token from a URL to its invoice.
 *
 * Verifies the signature, then the expiry, then loads the invoice. The order
 * matters: signature first, so an attacker cannot use an expiry check as an
 * oracle for whether a token was ever valid.
 */
export async function resolvePaymentToken(token: string): Promise<Invoice> {
  const parts = token.split(".");
  if (parts.length !== 3) throw invalidPaymentToken();

  const [nonce, expiresRaw, signature] = parts as [string, string, string];
  const payload = `${nonce}.${expiresRaw}`;

  if (!verify(payload, signature, paymentTokenSecret())) {
    throw invalidPaymentToken();
  }

  const expiresEpoch = Number(expiresRaw);
  if (!Number.isFinite(expiresEpoch) || expiresEpoch * 1000 < Date.now()) {
    throw paymentLinkExpired();
  }

  const service = createServiceClient();

  const { data: invoice, error } = await service
    .from("invoices")
    .select("*")
    .eq("pay_token", token)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!invoice) throw invalidPaymentToken();

  // Defence in depth: the signed expiry is authoritative, but reject a row
  // whose stored expiry disagrees.
  if (
    invoice.pay_token_expires_at &&
    new Date(invoice.pay_token_expires_at).getTime() < Date.now()
  ) {
    throw paymentLinkExpired();
  }

  return invoice;
}

/**
 * Marks an invoice sent and queues the WhatsApp invoice message (section 9).
 */
export async function sendInvoice(invoiceId: string): Promise<string> {
  const { token } = await issuePaymentToken(invoiceId);

  const service = createServiceClient();

  const { data: invoice, error } = await service
    .from("invoices")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", invoiceId)
    .select("order_id, total, customer_name")
    .single();

  if (error) throw new Error(error.message);

  await service.from("notifications").insert({
    user_id: null,
    channel: "whatsapp",
    template: "invoice_ready",
    invoice_id: invoiceId,
    order_id: invoice.order_id,
    payload: {
      invoice_id: invoiceId,
      amount: invoice.total,
      pay_url: `/pay/${token}`,
      order_no: invoice.order_id,
    },
  });

  return token;
}

/**
 * Records Cash on Delivery (Phase 1, section 6.4).
 *
 * Idempotent on the invoice: a second attempt returns the existing collected
 * payment rather than creating a duplicate, because the unique index on
 * gateway_payment_id plus this check together make a double tap harmless.
 */
export async function recordCashOnDelivery(
  invoiceId: string,
  amount: number,
  collectedBy: string,
): Promise<void> {
  const supabase = await createClient();

  const { data: existing, error: existingError } = await supabase
    .from("payments")
    .select("id")
    .eq("invoice_id", invoiceId)
    .eq("status", "collected")
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);
  if (existing) return;

  const { error } = await supabase.from("payments").insert({
    invoice_id: invoiceId,
    mode: "cod",
    amount,
    status: "collected",
    collected_by: collectedBy,
    collected_at: new Date().toISOString(),
  });

  if (error) throw new Error(error.message);

  const service = createServiceClient();
  await service
    .from("invoices")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", invoiceId);
}

// --- HMAC helpers ----------------------------------------------------------

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function verify(payload: string, signature: string, secret: string): boolean {
  const expected = Buffer.from(sign(payload, secret));
  const actual = Buffer.from(signature);

  // timingSafeEqual throws on a length mismatch, so compare lengths first.
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
