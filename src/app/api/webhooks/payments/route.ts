import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { createServiceClient } from "@/db/server";

/**
 * Payment gateway webhook (section 9).
 *
 * Three rules from the source document drive this handler:
 *   - Verify the signature. Never trust the browser redirect.
 *   - Be idempotent. A retried webhook must not credit the invoice twice.
 *   - Confirm the amount matches the invoice before marking it paid.
 */

type PaymentWebhookPayload = {
  event?: string;
  payment?: {
    id: string;
    order_id?: string;
    invoice_id?: string;
    amount?: number;
    currency?: string;
    method?: string;
  };
  invoice_id?: string;
  amount?: number;
  method?: string;
};

/**
 * Validates the HMAC signature over the raw request body.
 *
 * Signs the exact bytes received, not a re-serialised object: re-ordering keys
 * would change the digest and reject a legitimate delivery.
 */
function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);

  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: PaymentWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as PaymentWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const invoiceId = payload.invoice_id ?? payload.payment?.invoice_id;
  const paymentId = payload.payment?.id;
  const amount = payload.amount ?? payload.payment?.amount;

  if (!invoiceId || !paymentId) {
    return NextResponse.json(
      { error: "Missing invoice or payment id" },
      { status: 400 },
    );
  }

  const service = createServiceClient();

  // Idempotency: a replay finds the payment already recorded and stops.
  const { data: existing, error: existingError } = await service
    .from("payments")
    .select("id")
    .eq("gateway_payment_id", paymentId)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);
  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const { data: invoice, error: invoiceError } = await service
    .from("invoices")
    .select("id, total, status")
    .eq("id", invoiceId)
    .maybeSingle();

  if (invoiceError) throw new Error(invoiceError.message);
  if (!invoice) {
    return NextResponse.json({ error: "Unknown invoice" }, { status: 404 });
  }

  // An amount mismatch is a red flag, not a rounding difference. Do not credit.
  if (
    typeof amount === "number" &&
    Math.abs(amount - Number(invoice.total)) > 0.01
  ) {
    return NextResponse.json({ error: "Amount mismatch" }, { status: 400 });
  }

  const { error: paymentError } = await service.from("payments").insert({
    invoice_id: invoiceId,
    mode: normaliseMethod(payload.method ?? payload.payment?.method),
    gateway_payment_id: paymentId,
    gateway_order_id: payload.payment?.order_id ?? null,
    gateway_signature_valid: true,
    amount: amount ?? Number(invoice.total),
    status: "collected",
    collected_at: new Date().toISOString(),
  });

  if (paymentError) throw new Error(paymentError.message);

  const { error: invoiceError2 } = await service
    .from("invoices")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", invoiceId);

  if (invoiceError2) throw new Error(invoiceError2.message);

  const { data: order } = await service
    .from("orders")
    .select("id, customer_id, order_no, status")
    .eq("id", await invoiceOrderId(service, invoiceId))
    .maybeSingle();

  if (order) {
    // The transition trigger rejects this if the order is not in a state that
    // can reach paid, so a late webhook cannot resurrect a cancelled order.
    if (order.status === "invoice_sent" || order.status === "payment_pending") {
      await service
        .from("orders")
        .update({ status: "paid" })
        .eq("id", order.id);
    }

    await service.from("notifications").insert({
      user_id: order.customer_id,
      channel: "whatsapp",
      template: "payment_received",
      order_id: order.id,
      invoice_id: invoiceId,
      payload: { order_no: order.order_no, amount },
    });
  }

  return NextResponse.json({ ok: true });
}

async function invoiceOrderId(
  service: ReturnType<typeof createServiceClient>,
  invoiceId: string,
): Promise<string> {
  const { data } = await service
    .from("invoices")
    .select("order_id")
    .eq("id", invoiceId)
    .single();

  return data?.order_id ?? "";
}

function normaliseMethod(method?: string) {
  switch (method) {
    case "upi":
      return "upi" as const;
    case "card":
      return "card" as const;
    case "netbanking":
      return "netbanking" as const;
    case "wallet":
      return "wallet" as const;
    default:
      return "upi" as const;
  }
}
