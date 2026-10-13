import type { Metadata } from "next";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listActiveServices } from "@/db/queries/catalog";
import { createClient } from "@/db/server";
import { formatINR } from "@/lib/utils";

export const metadata: Metadata = { title: "Services and Prices" };
export const revalidate = 300;

export default async function ServicesPage() {
  const supabase = await createClient();
  const services = await listActiveServices(supabase).catch(() => []);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 px-4 py-12 sm:px-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          Services and prices
        </h1>
        <p className="text-[var(--muted-foreground)]">
          Final price is confirmed after we receive and assess your items.
        </p>
      </header>

      {services.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          No services are published yet.
        </p>
      ) : (
        <div className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
          {services.map((service) => (
            <Card
              key={service.id}
              className="rounded-none border-0 shadow-none"
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{service.name}</CardTitle>
              </CardHeader>
              <CardContent className="flex items-start justify-between gap-4 pt-0">
                {service.description ? (
                  <p className="max-w-prose text-sm text-[var(--muted-foreground)]">
                    {service.description}
                  </p>
                ) : (
                  <span />
                )}
                <p className="shrink-0 font-semibold">
                  {formatINR(service.price)}
                  <span className="text-sm font-normal text-[var(--muted-foreground)]">
                    {" "}
                    / {service.unit}
                  </span>
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
