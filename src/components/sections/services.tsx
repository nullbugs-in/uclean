import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { services } from "@/data/services";

export function Services() {
  return (
    <section
      id="services"
      className="border-border bg-muted/40 scroll-mt-20 border-y"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
        <div className="reveal-up max-w-2xl space-y-3">
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Services and prices
          </h2>
          <p className="text-muted-foreground">
            A simple, transparent price list. Your final total is confirmed
            after we receive and assess your items.
          </p>
        </div>

        <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => {
            const Icon = service.icon;
            return (
              <li key={service.id} className="reveal-up">
                <Card className="flex h-full flex-col transition-transform hover:-translate-y-1 hover:shadow-md">
                  <CardHeader>
                    <span
                      aria-hidden="true"
                      className="bg-accent text-accent-foreground grid size-11 place-items-center rounded-xl"
                    >
                      <Icon className="size-5" />
                    </span>
                    <CardTitle className="pt-2">{service.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col justify-between gap-4">
                    <p className="text-muted-foreground text-sm">
                      {service.description}
                    </p>
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-display text-xl font-bold">
                        {service.priceText}
                        <span className="text-muted-foreground text-sm font-normal">
                          {" "}
                          / {service.unit}
                        </span>
                      </p>
                      <Button asChild size="sm" variant="outline">
                        <Link href="/book">Book Now</Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
