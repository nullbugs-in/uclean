import type { Metadata } from "next";

import { PricingBrowser } from "@/components/pricing/pricing-browser";
import { PricingNotes } from "@/components/pricing/pricing-notes";
import { getPricingCategory, type CategorySlug } from "@/data/pricing";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Our full laundry price list. Compare Regular and Express service across wash and fold, dry cleaning, ironing, shoe cleaning, household items and curtain cleaning.",
};

type PricingSearchParams = Promise<{ speed?: string; group?: string }>;

/**
 * The home overview deep-links here as `/pricing?speed=&group=`, so read the
 * params and hand the browser its starting state. Both are validated against
 * the price data, so an unknown or hand-typed value falls back to the same
 * defaults the page has always opened on - and `/pricing` with no params is
 * unchanged.
 *
 * Reading `searchParams` makes this route dynamically rendered instead of
 * static; the prices still render into the HTML, so nothing is lost for
 * crawlers.
 */
export default async function PricingPage({
  searchParams,
}: {
  searchParams: PricingSearchParams;
}) {
  const { speed, group } = await searchParams;

  const initialSpeed: CategorySlug | undefined =
    speed === "regular" || speed === "express" ? speed : undefined;

  const category = getPricingCategory(initialSpeed ?? "regular");
  const initialGroup = category?.groups.some((entry) => entry.slug === group)
    ? group
    : undefined;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-10 px-4 py-12 sm:px-6">
      {/*
        Centred on phones, left-aligned from `sm`. `mx-auto` on the description
        is load-bearing alongside `text-center`: the paragraph is width-capped
        at `max-w-2xl`, so centring its text alone would leave the block itself
        sitting visibly left of centre.
      */}
      <header className="space-y-2 text-center sm:text-left">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Pricing
        </h1>
        <p className="text-muted-foreground mx-auto max-w-2xl sm:mx-0">
          Every price we charge, listed up front. Choose how fast you need it
          and see the full list for that service.
        </p>
      </header>

      <PricingBrowser initialSpeed={initialSpeed} initialGroup={initialGroup} />

      <PricingNotes />
    </div>
  );
}
