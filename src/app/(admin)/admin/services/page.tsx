import type { Metadata } from "next";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { readPricingRows } from "@/db/queries/pricing";
import { createClient } from "@/db/server";
import { requireAdmin } from "@/server/auth";

import { PricingPanel } from "./pricing-panel";

export const metadata: Metadata = { title: "Services and prices" };

/**
 * Services & Pricing (architecture doc, section 8.5).
 *
 * The price list every customer surface quotes from lives in the `pricing_*`
 * tables, and this page edits exactly those rows: categories, the services in
 * each, and the price lines that are actually quoted. Saving here is saving
 * everywhere — /pricing, the /book wizard, the walk-in counter, the invoice
 * lookup and the home overview read the same tables and are revalidated by the
 * actions — so there is no second list to keep in step and no dummy data.
 *
 * Express deliberately has no editor of its own. It is the Regular list at the
 * configured multiple, computed at read time, which is why the view shows
 * derived figures and refuses edits.
 *
 * The raw rows are read rather than the assembled public category: a retired
 * service or an emptied category has to stay visible and editable here even
 * though the public list hides them.
 */
export default async function AdminServicesPage() {
  await requireAdmin();
  const supabase = await createClient();

  const { groups, items, options } = await readPricingRows(supabase).catch(
    (error: unknown) => {
      console.error("Could not load the price list", error);
      return { groups: [], items: [], options: [] };
    },
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Categories, services and prices
        </CardTitle>
      </CardHeader>
      <CardContent>
        <PricingPanel
          groups={groups}
          items={items}
          options={options}
        />
      </CardContent>
    </Card>
  );
}
