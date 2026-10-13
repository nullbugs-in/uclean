import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/placeholder";
import { CustomerTable } from "./customer-table";

export const metadata: Metadata = { title: "Customers" };

/**
 * Customer list (section 8.2).
 *
 * Every sign-up is stored automatically by the auth trigger, so there is no
 * import step. Search is escaped in the query module so a name containing a
 * wildcard cannot widen the query.
 */
export default function AdminCustomersPage() {
  return (
    <PagePlaceholder
      title="Customers"
      description="Every account created through sign up or OTP login."
      milestone="Milestone 4"
    >
      <CustomerTable />
    </PagePlaceholder>
  );
}
