import Image from "next/image";

import { siteConfig } from "@/config/site";

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
            The three-stat divider strip is gone; this closing line is
            promoted to a branded pull-quote instead - display type behind a
            vertical brand-green gradient rule, captioned like an editorial
            quote. The rule ties it to the section's gradient language
            without a card surface.
          */}
          <figure className="pt-2">
            <blockquote className="relative pl-6">
              <span
                aria-hidden="true"
                className="absolute top-0 -bottom-0 left-0 w-1 rounded-full bg-gradient-to-b from-[var(--primary)] via-[var(--primary)]/70 to-transparent"
              />
              {/* Gradient-clipped type: the lime -> accent sweep of the
                  section's glow, painted into the glyphs and mixed toward
                  `--foreground` so it stays legible on the light surface
                  (and on the flipped dark palette). */}
              <p className="font-display bg-gradient-to-r from-[color-mix(in_oklab,var(--primary),var(--foreground)_28%)] via-[var(--primary)] to-[color-mix(in_oklab,var(--accent),var(--foreground)_22%)] bg-clip-text text-lg leading-snug font-bold text-balance text-transparent sm:text-xl">
                Doorstep pickup, honest slots, clothes that come back right —
                that is the {siteConfig.name} way.
              </p>
            </blockquote>
            <figcaption className="text-foreground/70 mt-3 pl-6 text-xs font-semibold tracking-widest uppercase">
              The {siteConfig.name} promise
            </figcaption>
          </figure>
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
