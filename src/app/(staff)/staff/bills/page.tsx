import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/placeholder";

export const metadata: Metadata = { title: "Bills" };

/**
 * Bill view for staff (section 10).
 *
 * Read-only by design: bills are created from recorded payments by an admin,
 * not editable here. RLS allows a staff member to read invoices attached to
 * orders they are assigned against, but no UPDATE policy exists for staff.
 */
export default function StaffBillsPage() {
  return (
    <PagePlaceholder
      title="Bills"
      description="Invoices and payment records for orders you handle."
      milestone="Milestone 6"
    >
      <p className="text-sm text-[var(--muted-foreground)]">
        Staff have read-only access to bills. There is no update policy for the
        staff role, so an edit attempt is rejected by the database rather than
        by the UI.
      </p>
    </PagePlaceholder>
  );
}
