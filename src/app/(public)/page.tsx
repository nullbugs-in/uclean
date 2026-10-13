import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  listActiveHeroSlides,
  listActiveServices,
  getPublicStoreSettings,
} from "@/db/queries/catalog";
import { createClient } from "@/db/server";
import { formatINR } from "@/lib/utils";

export const revalidate = 300;

/**
 * Public home page (section 5).
 *
 * Every section reads live from the database so an admin can change prices,
 * posters or store details without a deploy. When Supabase is unreachable the
 * page still renders its static copy rather than 500ing, because this is the
 * page a customer lands on.
 */
export default async function HomePage() {
  const supabase = await createClient();

  const [slides, services, store] = await Promise.all([
    listActiveHeroSlides(supabase).catch(() => []),
    listActiveServices(supabase).catch(() => []),
    getPublicStoreSettings(supabase).catch(() => null),
  ]);

  const [hero] = slides;

  return (
    <>
      {/* Hero */}
      <section className="border-b border-[var(--border)] bg-gradient-to-b from-[var(--accent)] to-[var(--background)]">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
          <div className="space-y-6">
            <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">
              Laundry pickup and delivery, sorted.
            </h1>
            <p className="max-w-prose text-lg text-[var(--muted-foreground)]">
              Book a pickup, track your order, and pay on delivery. We serve
              addresses within 6 km of our store.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/book">Book Now</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/services">Services</Link>
              </Button>
            </div>
            {slides.length > 1 ? (
              <p className="text-sm text-[var(--muted-foreground)]">
                {slides.length} posters in rotation:{" "}
                {slides.map((slide) => slide.title).join(", ")}
              </p>
            ) : null}
          </div>

          <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)]">
            {hero ? (
              <div className="relative aspect-16/10 w-full">
                {/* Placeholder block: the image itself lands with Milestone 2
                    once the Storage bucket and next/image config are wired up. */}
                <div className="flex size-full items-center justify-center bg-[var(--muted)] text-sm text-[var(--muted-foreground)]">
                  {hero.image_url}
                </div>
              </div>
            ) : (
              <div className="flex aspect-16/10 w-full items-center justify-center bg-[var(--muted)] text-sm text-[var(--muted-foreground)]">
                Poster carousel renders here
              </div>
            )}
          </div>
        </div>
      </section>

      {/* About */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <div className="max-w-prose space-y-3">
          <h2 className="text-2xl font-bold tracking-tight">About UClean</h2>
          <p className="text-[var(--muted-foreground)]">
            We collect your laundry from your door, clean it to a standard you
            can trust, and deliver it back in the slot you picked.
          </p>
        </div>
      </section>

      {/* Services */}
      <section
        id="services"
        className="border-y border-[var(--border)] bg-[var(--muted)]/40"
      >
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-bold tracking-tight">Services</h2>
          <p className="mt-2 text-[var(--muted-foreground)]">
            Prices come straight from our live price list.
          </p>

          {services.length === 0 ? (
            <p className="mt-6 text-sm text-[var(--muted-foreground)]">
              No services are published yet. Add them in Admin &gt; Services.
            </p>
          ) : (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {services.map((service) => (
                <Card key={service.id}>
                  <CardHeader>
                    <CardTitle>{service.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {service.description ? (
                      <p className="text-sm text-[var(--muted-foreground)]">
                        {service.description}
                      </p>
                    ) : null}
                    <p className="text-lg font-semibold">
                      {formatINR(service.price)}
                      <span className="text-sm font-normal text-[var(--muted-foreground)]">
                        {" "}
                        / {service.unit}
                      </span>
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Why UClean */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-2xl font-bold tracking-tight">Why UClean</h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              title: "Pickup and delivery",
              body: "No trip to the store needed.",
            },
            {
              title: "Hygiene",
              body: "Sorted and washed to a consistent standard.",
            },
            { title: "On time", body: "You pick the slot; we meet it." },
            {
              title: "Transparent pricing",
              body: "A live price list, no surprises.",
            },
          ].map((item) => (
            <li
              key={item.title}
              className="rounded-lg border border-[var(--border)] p-4"
            >
              <p className="font-medium">{item.title}</p>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                {item.body}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {/* Contact */}
      <section className="border-t border-[var(--border)] bg-[var(--muted)]/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-bold tracking-tight">Contact</h2>
          <div className="mt-4 space-y-1 text-[var(--muted-foreground)]">
            {store?.address ? (
              <p>{store.address}</p>
            ) : (
              <p>Store address not set yet.</p>
            )}
            <p>
              Open {store?.opening_time ?? "10:00"} to{" "}
              {store?.closing_time ?? "20:00"}
            </p>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            {store?.whatsapp_number ? (
              <Button asChild variant="outline">
                <a
                  href={`https://wa.me/${store.whatsapp_number.replace(/\D/g, "")}?text=${encodeURIComponent(
                    "Hi UClean, I would like to book a laundry pickup.",
                  )}`}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Chat on WhatsApp
                </a>
              </Button>
            ) : (
              <p className="text-sm text-[var(--muted-foreground)]">
                Add a WhatsApp number in Admin &gt; Settings to enable the chat
                button.
              </p>
            )}
            <p className="self-center text-xs text-[var(--muted-foreground)]">
              Embedded map renders here in Milestone 2.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
