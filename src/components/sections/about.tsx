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
    <section id="about" className="scroll-mt-20">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-14 sm:px-6 md:grid-cols-2 md:py-16 lg:gap-12 lg:py-24">
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
          */}
          <dl className="grid grid-cols-3 gap-2 pt-2 sm:gap-4">
            {STATS.map((stat) => {
              const Icon = stat.icon;
              return (
                <div
                  key={stat.label}
                  className="border-border bg-card rounded-2xl border p-3 text-center shadow-sm sm:p-4"
                >
                  <Icon
                    aria-hidden="true"
                    className="text-primary mx-auto size-5"
                  />
                  <dt className="sr-only">{stat.label}</dt>
                  <dd className="font-display mt-2 text-lg font-bold sm:text-xl">
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
