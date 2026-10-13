import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { recordDeliveryStatus } from "@/server/notifications";

/**
 * WhatsApp delivery status webhook (section 13).
 *
 * Verifies the X-Hub-Signature-256 header over the raw body before trusting
 * anything in it, then applies the status transition idempotently.
 */

type WhatsAppStatusEntry = {
  id: string;
  status?: "sent" | "delivered" | "read" | "failed" | "deleted";
  errors?: Array<{ code?: number; title?: string }>;
};

function verifySignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !header?.startsWith("sha256=")) return false;

  const provided = header.slice("sha256=".length);
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");

  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  if (left.length !== right.length) return false;

  return timingSafeEqual(left, right);
}

type WhatsAppWebhookPayload = {
  entry?: Array<{
    changes?: Array<{ value?: { statuses?: WhatsAppStatusEntry[] } }>;
  }>;
};

export async function POST(request: Request) {
  const rawBody = await request.text();

  if (!verifySignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: WhatsAppWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WhatsAppWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const entries = payload.entry ?? [];

  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      for (const status of change.value?.statuses ?? []) {
        if (!status.id) continue;
        if (status.status === "deleted") continue;

        await recordDeliveryStatus(
          status.id,
          status.status ?? "sent",
          status.errors?.[0]?.title,
        );
      }
    }
  }

  return NextResponse.json({ ok: true });
}
