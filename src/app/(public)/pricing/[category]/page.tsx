import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { PriceItemCard } from "@/components/pricing/price-item-card";
import { PricingNotes } from "@/components/pricing/pricing-notes";
import { getPricingCategory, pricingCategories } from "@/data/pricing";

type CategoryParams = { params: Promise<{ category: string }> };

/** Pre-renders /pricing/regular and /pricing/express at build time. */
export function generateStaticParams() {
  return pricingCategories.map((category) => ({ category: category.slug }));
}

export async function generateMetadata({
  params,
}: CategoryParams): Promise<Metadata> {
  const { category: slug } = await params;
  const category = getPricingCategory(slug);

  if (!category) return { title: "Pricing" };

  return {
    title: `${category.name} pricing`,
    description: `Our ${category.name} laundry price list, with a ${category.turnaround} turnaround.`,
  };
}

export default async function CategoryPage({ params }: CategoryParams) {
  const { category: slug } = await params;
  const category = getPricingCategory(slug);

  // Guards against /pricing/anything-else being requested.
  if (!category) notFound();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-10 px-4 py-12 sm:px-6">
      <header className="space-y-3">
        <Link
          href="/pricing"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded text-sm transition-colors"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          All pricing
        </Link>

        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {category.name} pricing
          </h1>
          <p className="text-muted-foreground mt-2 max-w-2xl">
            {category.tagline}
          </p>
        </div>

        <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Turnaround</dt>
            <dd className="font-medium">{category.turnaround}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Groups</dt>
            <dd className="font-medium">{category.groups.length}</dd>
          </div>
        </dl>

        {/*
          Express prices are computed from the regular list rather than
          transcribed separately, so say so instead of implying they were
          quoted independently.
        */}
        {category.derived ? (
          <p className="border-border bg-muted/40 rounded-lg border p-3 text-sm">
            These prices are {category.derivedFrom}, with a{" "}
            {category.turnaround} turnaround.
          </p>
        ) : null}
      </header>

      {category.groups.map((group) => (
        <section key={group.slug} className="space-y-5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="font-display text-xl font-bold tracking-tight">
              {group.name}
            </h2>
            {group.turnaround ? (
              <p className="text-muted-foreground text-sm">
                {group.items.length} items · ready in {group.turnaround}
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">
                {group.items.length} items
              </p>
            )}
          </div>

          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {group.items.map((item) => (
              <li key={item.slug}>
                <PriceItemCard item={item} group={group} />
              </li>
            ))}
          </ul>
        </section>
      ))}

      <PricingNotes />

      <p>
        <Link
          href="/book"
          className="text-primary inline-flex items-center rounded font-medium hover:underline"
        >
          Ready to book? Pick a pickup slot
        </Link>
      </p>
    </div>
  );
}
