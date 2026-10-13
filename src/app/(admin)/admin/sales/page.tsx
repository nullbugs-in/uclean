import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/placeholder";

export const metadata: Metadata = { title: "Sales reports" };

/**
 * Sales reports (section 8.9).
 *
 * Daily, weekly and monthly sales by service, payment mode and agent, with CSV
 * export. Includes walk-in orders because they are ordinary rows with
 * source = walk_in.
 */
export default function AdminSalesPage() {
  return (
    <PagePlaceholder
      title="Sales reports"
      description="Sales by service, payment mode and agent, with CSV export."
      milestone="Milestone 7"
    >
      <p className="text-sm text-[var(--muted-foreground)]">
        GST treatment and invoice numbering are still open questions in the
        source design. The invoices table already carries a GSTIN on
        store_settings and a GST-safe invoice number, so set them in Settings
        before the first real invoice.
      </p>
    </PagePlaceholder>
  );
}
