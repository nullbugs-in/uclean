import Image from "next/image";
import {
  BedDouble,
  Blinds,
  Footprints,
  Shirt,
  Sparkles,
  Baby,
} from "lucide-react";

import type { PriceGroup, PriceItem } from "@/lib/pricing";

/**
 * Artwork for a price item, or a deterministic placeholder while the real
 * photos are outstanding.
 *
 * The gradient is derived from the item slug so every tile looks intentional and
 * differs from its neighbours, rather than showing the same empty box 47 times
 * or, worse, a broken image.
 */

/**
 * Group-level icons. Kept here rather than in the data module so
 * `src/data/pricing.ts` stays free of presentation concerns.
 */
const GROUP_ICONS: Record<string, typeof Shirt> = {
  "laundry-services": Sparkles,
  "adult-wear": Shirt,
  "kids-wear": Baby,
  "shoe-cleaning": Footprints,
  household: BedDouble,
  "curtain-cleaning": Blinds,
};

/**
 * Light and dark pairs. Tailwind needs these as whole literal class names to
 * generate them, so they must not be assembled at runtime.
 */
const TILE_GRADIENTS = [
  "from-lime-200 to-emerald-300 dark:from-lime-900 dark:to-emerald-800",
  "from-sky-200 to-blue-300 dark:from-sky-900 dark:to-blue-800",
  "from-amber-200 to-orange-300 dark:from-amber-900 dark:to-orange-800",
  "from-fuchsia-200 to-purple-300 dark:from-fuchsia-900 dark:to-purple-800",
  "from-rose-200 to-pink-300 dark:from-rose-900 dark:to-pink-800",
  "from-teal-200 to-cyan-300 dark:from-teal-900 dark:to-cyan-800",
];

/** Small, stable string hash so the same slug always picks the same gradient. */
function hash(input: string): number {
  let value = 0;
  for (let index = 0; index < input.length; index += 1) {
    value = (value * 31 + input.charCodeAt(index)) % 100_003;
  }
  return value;
}

export function ServiceImage({
  item,
  group,
  className,
}: {
  item: PriceItem;
  group: PriceGroup;
  className?: string;
}) {
  const Icon = GROUP_ICONS[group.slug] ?? Sparkles;
  const gradient =
    TILE_GRADIENTS[hash(`${group.slug}/${item.slug}`) % TILE_GRADIENTS.length];

  if (item.image) {
    return (
      <Image
        src={item.image}
        // The item name is already the card heading, so the image is
        // decorative and should not be announced twice.
        alt=""
        fill
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
        className={`object-cover ${className ?? ""}`}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className={`bg-gradient-to-br ${gradient} grid size-full place-items-center ${className ?? ""}`}
    >
      <Icon className="text-foreground/45 size-8" />
    </div>
  );
}
