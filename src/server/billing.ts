import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { createClient, createServiceClient } from "@/db/server";
import type { Invoice, OrderItem } from "@/db/types";

import { invalidPaymentToken, paymentLinkExpired } from "./errors";
import { paymentTokenSecret } from "./env";

export { BillingError } from "@/lib/invoice";

/** How long a WhatsApp payment link stays usable. */
export const PAY_LINK_TTL_DAYS = 7;

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

/**
 * The lines behind an invoice, for the customer's copy.
 *
 * Read with the service role because the pay page has no session: the signed
 * token is the credential, and this only ever runs for the order that token
 * already resolved to. A session check here would be theatre rather than a
 * control.
 */
export async function listInvoiceLines(orderId: string): Promise<OrderItem[]> {
  const service = createServiceClient();

  const { data, error } = await service
    .from("order_items")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
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
