import Link from "next/link";

import { CategoryCard } from "@/components/pricing/category-card";
import { pricingCategories } from "@/data/pricing";

export function Services() {
  return (
    <section
      id="services"
      className="border-border bg-muted/40 scroll-mt-20 border-y"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 md:py-16 lg:py-24">
        <div className="reveal-up max-w-2xl space-y-3">
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Services and prices
          </h2>
          <p className="text-muted-foreground">
            Two ways to get your laundry done: our standard service, or express
            when you need it back fast. Pick one to see every price.
          </p>
        </div>

        <ul className="mt-10 grid gap-5 sm:grid-cols-2">
          {pricingCategories.map((category) => (
            <li key={category.slug} className="reveal-up">
              <CategoryCard category={category} />
            </li>
          ))}
        </ul>

        <p className="mt-8">
          <Link
            href="/pricing"
            className="text-primary inline-flex items-center rounded text-sm font-medium hover:underline"
          >
            Compare both price lists side by side
          </Link>
        </p>
      </div>
    </section>
  );
}
