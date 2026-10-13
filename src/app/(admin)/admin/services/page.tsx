import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/placeholder";
import { ServiceTable } from "./service-table";

export const metadata: Metadata = { title: "Services and prices" };

/**
 * Service and price list (section 8.13).
 *
 * Prices are read live by the public Services page and by invoice generation,
 * so an edit here changes what customers see and what they are billed without a
 * deploy. Every change lands in audit_logs.
 */
export default function AdminServicesPage() {
  return (
    <PagePlaceholder
      title="Services and prices"
      description="The live price list used by the public site and invoicing."
      milestone="Milestone 4"
    >
      <ServiceTable />
    </PagePlaceholder>
  );
}
