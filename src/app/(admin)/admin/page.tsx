import type { Metadata } from "next";
import Link from "next/link";

import { PagePlaceholder } from "@/components/placeholder";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminOrderCounts } from "@/db/queries/orders";
import { createClient } from "@/db/server";
import { getStoreSettings } from "@/db/queries/catalog";
import { toDateKey } from "@/server/slots";

export const metadata: Metadata = { title: "Admin dashboard" };

/**
 * Admin dashboard (section 8.1).
 *
 * The headline counters read live. Slot utilisation, agent workload, top
 * services and repeat customers land with Milestone 7's analytics work.
 */
export default async function AdminDashboardPage() {
  const supabase = await createClient();

  const [counts, store] = await Promise.all([
    getAdminOrderCounts(supabase, toDateKey(new Date())).catch(() => null),
    getStoreSettings(supabase).catch(() => null),
  ]);

  const stats = [
    { label: "Orders today", value: counts?.ordersToday ?? "-" },
    { label: "Pending pickups", value: counts?.pendingPickups ?? "-" },
    { label: "Delivered today", value: counts?.deliveredToday ?? "-" },
  ];

  return (
    <PagePlaceholder
      title="Dashboard"
      description="Today at a glance."
      milestone="Milestone 7 for slot utilisation, agent workload and revenue charts"
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-normal text-[var(--muted-foreground)]">
                {stat.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Setup checks</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <SetupCheck
            ok={store?.lat !== null && store?.lng !== null}
            label="Store coordinates set"
            hint="Pickup booking refuses to run until these are set in Settings."
          />
          <SetupCheck
            ok={false}
            label="Slot capacity configured"
            hint="Seeded at 0, which reads as full. Set a capacity per slot in Time slots."
          />
          <p className="text-xs text-[var(--muted-foreground)]">
            Both are open questions in the source design, so neither is guessed.{" "}
            <Link
              href="/admin/settings"
              className="font-medium text-[var(--primary)] underline-offset-4 hover:underline"
            >
              Open settings
            </Link>
          </p>
        </CardContent>
      </Card>
    </PagePlaceholder>
  );
}

function SetupCheck({
  ok,
  label,
  hint,
}: {
  ok: boolean;
  label: string;
  hint: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <span
        className={ok ? "text-emerald-600" : "text-amber-600"}
        aria-hidden="true"
      >
        {ok ? "OK" : "TODO"}
      </span>
      <div>
        <p className="font-medium">{label}</p>
        <p className="text-xs text-[var(--muted-foreground)]">{hint}</p>
      </div>
    </div>
  );
}
