import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime, formatINR } from "@/lib/utils";
import { DomainError } from "@/server/errors";
import { listInvoiceLines, resolvePaymentToken } from "@/server/billing";

import { PrintButton } from "./print-button";

export const metadata: Metadata = {
  title: "Pay your invoice",
  robots: { index: false, follow: false },
};

/**
 * Public invoice and checkout page (section 4, section 9).
 *
 * No login: the signed, expiring token in the URL is the credential. That makes
 * this page the one route middleware must not gate, and the token must be
 * treated as a secret: it is marked noindex and is single-invoice scoped.
 *
 * The page is also the invoice document itself. Phase 1 has no PDF step, so the
 * printed page is the bill: `listInvoiceLines` adds the itemised lines and the
 * print stylesheet in globals.css strips the checkout affordances, leaving the
 * customer able to save or print a clean copy.
 */
export default async function PayPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let invoice;
  try {
    invoice = await resolvePaymentToken(token);
  } catch (error) {
    const message =
      error instanceof DomainError
        ? error.userMessage
        : "This payment link is not valid.";

    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Payment link unavailable</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-[var(--muted-foreground)]">{message}</p>
            <p className="text-sm text-[var(--muted-foreground)]">
              If you were expecting a link, reply to the WhatsApp message you
              received and we will send a fresh one.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isPaid = invoice.status === "paid";
  const lines = await listInvoiceLines(invoice.order_id).catch(() => []);

  return (
    <div className="invoice-document flex min-h-dvh items-center justify-center px-4 py-12">
      <Card className="invoice-sheet w-full max-w-md">
        <CardHeader>
          <CardTitle>Invoice {invoice.invoice_no}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1 text-sm">
            <Row label="Billed to" value={invoice.customer_name} />
            <Row label="Mobile" value={invoice.customer_mobile} />
            <Row label="Address" value={invoice.billing_address} />
            {invoice.sent_at ? (
              <Row label="Sent" value={formatDateTime(invoice.sent_at)} />
            ) : null}
          </div>

          {lines.length > 0 ? (
            <div className="border-t border-[var(--border)] pt-4">
              <h2 className="mb-2 text-sm font-medium">Items</h2>
              <ul className="space-y-1 text-sm">
                {lines.map((line) => (
                  <li
                    key={line.id}
                    className="flex items-baseline justify-between gap-4"
                  >
                    <span>
                      {line.item_name}
                      <span className="text-[var(--muted-foreground)]">
                        {" "}
                        {line.qty} x {formatINR(line.unit_price)}
                      </span>
                    </span>
                    <span className="tabular-nums">
                      {formatINR(line.qty * line.unit_price)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <dl className="space-y-1 border-t border-[var(--border)] pt-4 text-sm">
            <Row label="Subtotal" value={formatINR(invoice.subtotal)} />
            {invoice.tax > 0 ? (
              <Row label="Tax" value={formatINR(invoice.tax)} />
            ) : null}
            {invoice.discount > 0 ? (
              <Row label="Discount" value={`-${formatINR(invoice.discount)}`} />
            ) : null}
            {invoice.delivery_charge > 0 ? (
              <Row
                label="Delivery"
                value={formatINR(invoice.delivery_charge)}
              />
            ) : null}
            <div className="flex items-center justify-between pt-2 text-base font-semibold">
              <dt>Total</dt>
              <dd>{formatINR(invoice.total)}</dd>
            </div>
          </dl>

          <PrintButton />

          {isPaid ? (
            <p className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">
              Paid
              {invoice.paid_at ? ` on ${formatDateTime(invoice.paid_at)}` : ""}.
              Thank you.
            </p>
          ) : (
            <div className="invoice-screen-only space-y-2">
              {/* Phase 1 is Cash on Delivery; the gateway checkout renders here
                  in Phase 2 behind this same signed link. */}
              <Button className="w-full" disabled>
                Pay {formatINR(invoice.total)} online (Phase 2)
              </Button>
              <p className="text-center text-xs text-[var(--muted-foreground)]">
                Pay the delivery agent in cash for now.
              </p>
            </div>
          )}

          <p className="invoice-screen-only text-xs text-[var(--muted-foreground)]">
            This link expires {formatDateTime(invoice.pay_token_expires_at)} and
            works only for this invoice.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-[var(--muted-foreground)]">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
