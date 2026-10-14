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
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
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

          <dl className="grid grid-cols-3 gap-4 pt-2">
            {STATS.map((stat) => {
              const Icon = stat.icon;
              return (
                <div
                  key={stat.label}
                  className="border-border bg-card rounded-2xl border p-4 text-center shadow-sm"
                >
                  <Icon
                    aria-hidden="true"
                    className="text-primary mx-auto size-5"
                  />
                  <dt className="sr-only">{stat.label}</dt>
                  <dd className="font-display mt-2 text-xl font-bold">
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
          className="reveal-up border-border via-accent relative aspect-square w-full overflow-hidden rounded-3xl border bg-gradient-to-br from-lime-200 to-sky-100"
        >
          <div className="absolute inset-0 [background-image:radial-gradient(circle_at_20%_20%,white,transparent_45%),radial-gradient(circle_at_80%_70%,white,transparent_50%)] opacity-70" />
          <div className="absolute inset-0 grid place-items-center p-10">
            <div className="grid w-full max-w-sm grid-cols-2 gap-4">
              <div className="rounded-2xl bg-white/80 p-5 shadow-sm backdrop-blur-sm">
                <p className="font-display text-primary-foreground text-2xl font-bold">
                  Pickup
                </p>
                <p className="text-primary-foreground/70 text-sm">
                  10 AM - 2 PM
                </p>
              </div>
              <div className="mt-6 rounded-2xl bg-white/80 p-5 shadow-sm backdrop-blur-sm">
                <p className="font-display text-primary-foreground text-2xl font-bold">
                  Delivery
                </p>
                <p className="text-primary-foreground/70 text-sm">
                  3 PM - 8 PM
                </p>
              </div>
              <div className="bg-primary text-primary-foreground col-span-2 rounded-2xl p-5 shadow-sm">
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
