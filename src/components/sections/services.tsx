import type { PriceCategory } from "@/lib/pricing";

import { PricingOverview } from "@/components/pricing/pricing-overview";

export function Services({ regular }: { regular: PriceCategory }) {
  return (
    <section
      id="services"
      className="border-border bg-muted/40 scroll-mt-20 border-y"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 md:py-16 lg:py-24">
        {/*
          Below `lg` the header, the speed toggle and the caption all share the
          centre axis; the toggle and caption are centred at every width, so a
          left-aligned header made the block read as split. From `lg` the header
          returns to the left rail it shares with the other sections.
        */}
        <div className="reveal-up mx-auto max-w-2xl space-y-3 text-center lg:mx-0 lg:text-left">
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Services and prices
          </h2>
          <p className="text-muted-foreground">
            Two ways to get your laundry done: our standard service, or express
            when you need it back fast. Pick a category to see every price.
          </p>
        </div>

        <PricingOverview regular={regular} />
      </div>
    </section>
  );
}
