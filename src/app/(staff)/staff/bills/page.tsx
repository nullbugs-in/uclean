import type { Metadata } from "next";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { StaffPage } from "../../_components/staff-page";

export const metadata: Metadata = { title: "Bills" };

/**
 * Bill view for staff (section 10).
 *
 * Read-only by design: bills are created from recorded payments by an admin,
 * not editable here. RLS allows a staff member to read invoices attached to
 * orders they are assigned against, but no UPDATE policy exists for staff.
 *
 * It states that up front instead of presenting fields a submit button would
 * reject - the limit belongs in the database, but the screen should not invite
 * the attempt.
 */
export default function StaffBillsPage() {
  return (
    <StaffPage
      title="Bills"
      description="Invoices and payment records for orders you handle."
    >
      <Card>
        <CardHeader>
          <CardTitle>Read-only</CardTitle>
          <CardDescription>
            Bills are created from recorded payments by an admin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            There is no update policy for the staff role, so an edit attempt is
            rejected by the database rather than by the UI.
          </p>
        </CardContent>
      </Card>
    </StaffPage>
  );
}
