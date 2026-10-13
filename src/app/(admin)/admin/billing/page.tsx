import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/placeholder";

export const metadata: Metadata = { title: "Billing" };

/**
 * Product analysis and billing (section 8.4 and 8.5).
 *
 * Admin records items received, prices come from the live price list, and the
 * invoice is generated with tax, discount and delivery charge. The flow is
 * implemented server side already: createInvoice, issuePaymentToken and
 * sendInvoice in src/server/billing.ts.
 */
export default function AdminBillingPage() {
  return (
    <PagePlaceholder
      title="Billing"
      description="Record items, generate invoices, and send payment links."
      milestone="Milestone 6 for the item entry and invoice form"
    >
      <ol className="space-y-2 text-sm">
        {[
          "Record the items received: type, quantity, service, notes and photos.",
          "Prices are pulled from the live price list rather than typed.",
          "Generate the invoice: items, tax, discount, delivery charge, total.",
          "Send it to the customer's WhatsApp number with a link to /pay/[token].",
        ].map((item, index) => (
          <li key={item} className="flex gap-3">
            <span className="font-medium text-[var(--muted-foreground)]">
              {index + 1}.
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ol>
      <p className="text-sm text-[var(--muted-foreground)]">
        Phase 1 shows the invoice with Cash on Delivery. Phase 2 adds the
        gateway checkout behind the same signed link.
      </p>
    </PagePlaceholder>
  );
}
