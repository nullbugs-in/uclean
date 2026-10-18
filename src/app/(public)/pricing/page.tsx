import type { Metadata } from "next";

import { PricingBrowser } from "@/components/pricing/pricing-browser";
import { PricingNotes } from "@/components/pricing/pricing-notes";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Our full laundry price list. Compare Regular and Express service across wash and fold, dry cleaning, ironing, shoe cleaning, household items and curtain cleaning.",
};

export default function PricingPage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-10 px-4 py-12 sm:px-6">
      <header className="space-y-2">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Pricing
        </h1>
        <p className="text-muted-foreground max-w-2xl">
          Every price we charge, listed up front. Choose how fast you need it
          and see the full list for that service.
        </p>
      </header>

      <PricingBrowser />

      <PricingNotes />

     
    </div>
  );
}
