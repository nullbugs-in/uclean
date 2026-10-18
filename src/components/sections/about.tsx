import Image from "next/image";
import { CalendarClock, MapPin, Truck } from "lucide-react";

import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

const STATS = [
  {
    icon: MapPin,
    value: `${siteConfig.deliveryRadiusKm} km`,
    label: "Pickup zone",
  },
  {
    icon: CalendarClock,
    value: "Hourly",
    label: "Pickup slots",
  },
  {
    icon: Truck,
    value: "Live",
    label: "Order tracking",
  },
] as const;

export function About() {
  return (
    <section
      id="about"
      className="relative scroll-mt-20 overflow-hidden bg-gradient-to-br from-[var(--accent)]/60 via-[var(--background)] to-[var(--secondary)]"
    >
      {/*
        Brand green glow, same logo palette as the hero gradient, so the About
        section carries the theme colour without a hard background edge.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-16 size-[26rem] rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--primary),transparent_78%),transparent)] blur-3xl"
      />
      <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-14 sm:px-6 md:grid-cols-2 md:py-16 lg:gap-12 lg:py-24">
        <div className="reveal-up space-y-6">
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Laundry day, off your plate.
          </h2>
          <p className="text-muted-foreground">
            {siteConfig.name} started with a simple promise: clean clothes
            without the trip to the store. Book online, we collect from your
            door within {siteConfig.deliveryRadiusKm} km, clean everything with
            care, and deliver it back in the slot you picked.
          </p>
          <p className="text-muted-foreground">
            No queues, no guesswork. Just fresh laundry, on time.
          </p>

          {/*
            A flat divider strip rather than cards: icon, value and label sit
            straight on the section, split by a thin brand-green rule with no
            surface, border box or shadow. Three columns hold down to 320px as
            long as the padding and gaps step down; the rule is what keeps the
            cells visually separate without a card outline.
          */}
          <dl className="grid grid-cols-3 gap-3 pt-2 sm:gap-6">
            {STATS.map((stat, index) => {
              const Icon = stat.icon;
              return (
                <div
                  key={stat.label}
                  className={cn(
                    "space-y-1",
                    index > 0 &&
                      "border-l border-[var(--primary)]/30 pl-3 sm:pl-6",
                  )}
                >
                  <Icon aria-hidden="true" className="text-primary size-5" />
                  <dt className="sr-only">{stat.label}</dt>
                  <dd className="font-display text-xl leading-none font-bold sm:text-2xl">
                    {stat.value}
                  </dd>
                  <dd className="text-muted-foreground text-xs">
                    {stat.label}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>

        <div
          aria-hidden="true"
          className="reveal-up border-border from-accent via-background to-card relative aspect-4/3 w-full overflow-hidden rounded-3xl border bg-gradient-to-br sm:aspect-square"
        >
          <Image
            src="/aboutsession.jpg"
            alt=""
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 50vw"
          />
        </div>
      </div>
    </section>
  );
}
