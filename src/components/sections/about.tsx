import Image from "next/image";
import { CalendarClock, MapPin, Truck } from "lucide-react";

import { siteConfig } from "@/config/site";

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
            Three stats stay on one row even at 320px, but the padding and gaps
            step down so each cell keeps enough text box for "Order tracking".
            The solid primary icon chip is the tallest element, so the tile
            height is driven by it plus the two lines of copy.
          */}
          <dl className="grid grid-cols-3 gap-2 pt-2 sm:gap-4">
            {STATS.map((stat) => {
              const Icon = stat.icon;
              return (
                <div
                  key={stat.label}
                  className="border-border to-card group relative overflow-hidden rounded-2xl border bg-gradient-to-br from-[color-mix(in_oklab,var(--primary),transparent_78%)] via-[var(--accent)]/50 p-3 text-center shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md sm:p-4"
                >
                  <span
                    aria-hidden="true"
                    className="bg-primary text-primary-foreground mx-auto grid size-9 place-items-center rounded-xl shadow-sm transition-transform duration-200 group-hover:scale-105 sm:size-10"
                  >
                    <Icon className="size-4 sm:size-5" />
                  </span>
                  <dt className="sr-only">{stat.label}</dt>
                  <dd className="font-display mt-3 text-lg font-bold sm:text-xl">
                    {stat.value}
                  </dd>
                  <dd className="text-muted-foreground mt-0.5 text-xs">
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
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/30 to-black/15"
          />
          <div className="absolute inset-0 grid place-items-center p-5 sm:p-10">
            <div className="grid w-full max-w-sm grid-cols-2 gap-3 sm:gap-4">
              <div className="bg-card/80 rounded-2xl p-4 shadow-sm backdrop-blur-sm sm:p-5">
                <p className="font-display text-foreground text-xl font-bold sm:text-2xl">
                  Pickup
                </p>
                <p className="text-muted-foreground text-sm">10 AM - 2 PM</p>
              </div>
              <div className="bg-card/80 mt-6 rounded-2xl p-4 shadow-sm backdrop-blur-sm sm:p-5">
                <p className="font-display text-foreground text-xl font-bold sm:text-2xl">
                  Delivery
                </p>
                <p className="text-muted-foreground text-sm">3 PM - 8 PM</p>
              </div>
              <div className="bg-primary text-primary-foreground col-span-2 rounded-2xl p-4 shadow-sm sm:p-5">
                <p className="font-display text-xl font-bold">
                  Bubbles, sorted.
                </p>
                <p className="text-sm opacity-80">Washed, folded, delivered.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
