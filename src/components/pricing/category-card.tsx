import Link from "next/link";
import { ArrowRight, Zap } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cheapestPrice, itemCount, type PriceCategory } from "@/data/pricing";
import { formatPrice } from "@/lib/utils";

/**
 * Entry card for one price category.
 *
 * The whole card is a link, so it is rendered as a single anchor rather than a
 * link nested inside the card chrome, which would break keyboard navigation.
 */
export function CategoryCard({ category }: { category: PriceCategory }) {
  const cheapest = cheapestPrice(category);
  const count = itemCount(category);
  const Express = category.slug === "express";

  return (
    <Link
      href={`/pricing/${category.slug}`}
      className="group focus-visible:ring-ring rounded-2xl focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      <Card className="h-full transition-transform group-hover:-translate-y-1 group-hover:shadow-md">
        <CardHeader>
          <span
            aria-hidden="true"
            className={
              Express
                ? "bg-primary text-primary-foreground grid size-11 place-items-center rounded-xl"
                : "bg-accent text-accent-foreground grid size-11 place-items-center rounded-xl"
            }
          >
            <Zap className="size-5" />
          </span>
          <CardTitle className="pt-2">{category.name}</CardTitle>
        </CardHeader>

        <CardContent className="flex flex-1 flex-col justify-between gap-4">
          <p className="text-muted-foreground text-sm">{category.tagline}</p>

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground text-xs">Turnaround</dt>
              <dd className="font-medium">{category.turnaround}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Items priced</dt>
              <dd className="font-medium">{count}</dd>
            </div>
          </dl>

          <p className="flex items-baseline justify-between gap-3">
            <span className="font-display text-2xl font-bold">
              {formatPrice(cheapest.price)}
              <span className="text-muted-foreground text-sm font-normal">
                {" "}
                / {cheapest.unit}
              </span>
            </span>
            <span className="text-muted-foreground group-hover:text-foreground inline-flex items-center gap-1 text-sm font-medium transition-colors">
              View prices
              <ArrowRight className="size-4" />
            </span>
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
