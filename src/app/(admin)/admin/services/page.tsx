import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/placeholder";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listServices } from "@/db/queries/catalog";
import { createClient } from "@/db/server";

import { ServicesPanel } from "./services-panel";

export const metadata: Metadata = { title: "Services and prices" };

/**
 * Service and price list (section 8.13).
 *
 * The billing catalogue: invoices price line items from these rows, so an edit
 * here changes what an order is billed without a deploy.
 *
 * The public /pricing page is a separate, static list (`src/data/pricing.ts`,
 * transcribed from `laundry_price_list_updated.md`), so a change here does not
 * move the marketing pages. That split is deliberate: one is marketing copy with
 * Regular and Express tiers, the other is what the store bills.
 *
 * Reads fall back to an empty list on error so the page still renders its forms
 * rather than dropping to an error boundary.
 */
export default async function AdminServicesPage() {
  const supabase = await createClient();
  const services = await listServices(supabase).catch(() => []);

  return (
    <PagePlaceholder
      title="Services and prices"
      description="The billing catalogue that invoices price from."
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Billing catalogue</CardTitle>
        </CardHeader>
        <CardContent>
          <ServicesPanel services={services} />
        </CardContent>
      </Card>
    </PagePlaceholder>
  );
}
