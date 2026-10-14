import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPrice } from "@/lib/utils";
import type { PriceGroup, PriceItem } from "@/data/pricing";

import { ServiceImage } from "./service-image";

/**
 * A single priced item.
 *
 * Items with one price (Shoe Cleaning, Household) show it bare; items with two
 * (Dry Cleaning and Steam Ironing) break out one labelled row per option so the
 * two are never confused for each other.
 */
export function PriceItemCard({
  item,
  group,
}: {
  item: PriceItem;
  group: PriceGroup;
}) {
  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <div className="relative aspect-4/3 w-full shrink-0">
        <ServiceImage item={item} group={group} />
      </div>

      <CardHeader className="pb-3">
        <CardTitle className="text-base leading-snug">{item.name}</CardTitle>
        {group.turnaround ? (
          <p className="text-muted-foreground text-xs">
            Ready in {group.turnaround}
          </p>
        ) : null}
      </CardHeader>

      <CardContent className="flex flex-1 flex-col justify-end">
        <ul className="space-y-2">
          {item.options.map((option, index) => (
            <li
              key={option.label ?? `${item.slug}-${index}`}
              className="flex items-baseline justify-between gap-3"
            >
              <span className="min-w-0">
                {option.label ? (
                  <span className="block text-sm font-medium">
                    {option.label}
                  </span>
                ) : null}
                {option.turnaround ? (
                  <span className="text-muted-foreground block text-xs">
                    {option.turnaround}
                  </span>
                ) : null}
              </span>

              <span className="shrink-0 text-right whitespace-nowrap">
                <span className="text-muted-foreground mr-2 text-sm line-through">
                  {formatPrice(option.original)}
                </span>
                <span className="font-display text-lg font-bold">
                  {formatPrice(option.price)}
                </span>
                <span className="text-muted-foreground text-xs">
                  {" "}
                  / {option.unit}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
