import { Badge } from "@/components/ui/badge";
import type { InvoiceStatus } from "@/db/types";

/**
 * The invoice stage as a badge.
 *
 * Shared by the admin billing list and the staff bill list: both show the same
 * four states, and one component keeps the wording and the colours from drifting
 * apart between the two panels.
 */
export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  if (status === "paid") return <Badge variant="success">Paid</Badge>;
  if (status === "sent") return <Badge variant="warning">Sent</Badge>;
  if (status === "void") return <Badge variant="outline">Void</Badge>;

  return <Badge variant="secondary">Draft</Badge>;
}
