"use client";

import Image from "next/image";
import Link from "next/link";
import { CalendarClock, Radar, Truck } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import { heroSlides } from "@/data/heroSlides";
import { cn } from "@/lib/utils";

const SLIDESHOW_MS = 3000;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getReducedMotionSnapshot() {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function getReducedMotionServerSnapshot() {
  return false;
}

/**
 * Brand-at-a-glance facts shown as a row of three cards under the hero CTAs.
 * Same icon/value/label anatomy as the About section's stats, kept as compact
 * glass cards here so they stay legible over the slideshow (About renders its
 * stats as a flat divider strip). Values come from `siteConfig` where they
 * exist so there is a single source of truth.
 */
const STATS = [
  {
    icon: Truck,
    value: `${siteConfig.deliveryRadiusKm} km`,
    label: "Free pickup & delivery",
  },
  {
    icon: CalendarClock,
    value: "Hourly",
    label: "Pickup slots",
  },
  {
    icon: Radar,
    value: "Live",
    label: "Order tracking",
  },
] as const;

export function Hero() {
  const slides = heroSlides.filter((slide) => slide.image);
  const count = slides.length;
  const [index, setIndex] = useState(0);
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  );

  /*
   * Auto-advance every 3 seconds, looping back to the first slide after the
   * last. The interval is cleaned up on unmount and whenever `reducedMotion`
   * changes; with reduced motion the first image stays put and the opacity
   * crossfade never fires (see `motion-reduce:transition-none` below).
   */
  useEffect(() => {
    if (reducedMotion || count < 2) return;
    const id = window.setInterval(
      () => setIndex((current) => (current + 1) % count),
      SLIDESHOW_MS,
    );
    return () => window.clearInterval(id);
  }, [reducedMotion, count]);

  if (count === 0) return null;

  return (
    <section
      id="hero"
      className="border-border relative scroll-mt-20 overflow-hidden border-b bg-gradient-to-br from-[var(--accent)] via-[var(--secondary)]/70 to-[var(--background)] lg:flex lg:min-h-[calc(100dvh-4rem)] lg:items-center"
    >
      {/*
        Full-bleed background slideshow. Every slide is rendered up front and
        stacked in the same box, so the browser fetches all three images on
        load - the inactive ones sit at opacity 0, which means the crossfade
        swaps pixels rather than waiting on the network (no blank flashes).
        `fill` + `object-cover` + `sizes="100vw"` covers the section edge to
        edge without distorting the mismatched source aspect ratios (3:2,
        1:1, 4:5). The first slide is `priority` since it is the LCP element.
      */}
      <div aria-hidden="true" className="absolute inset-0">
        {slides.map((slide, slideIndex) => (
          <Image
            key={slide.id}
            src={slide.image!.src}
            alt=""
            fill
            priority={slideIndex === 0}
            sizes="100vw"
            className={cn(
              "object-cover transition-opacity duration-[600ms] ease-in-out motion-reduce:transition-none",
              slideIndex === index ? "opacity-100" : "opacity-0",
            )}
          />
        ))}
      </div>

      {/*
        Brand green gradient. Built from the logo palette - lime `--primary`
        and soft `--accent` green over the dark-green `--foreground` family -
        as a light diagonal wash over the photos so the hero reads green
        without hiding them. Kept gentle (and under the legibility scrim below)
        so the slideshow stays the star.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,color-mix(in_oklab,var(--primary),transparent_80%)_0%,transparent_45%,color-mix(in_oklab,var(--accent),transparent_68%)_100%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -left-20 size-[26rem] rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--primary),transparent_88%),transparent)] blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -bottom-28 size-[30rem] rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--accent),transparent_86%),transparent)] blur-3xl"
      />

      {/*
        Locally scoped legibility scrim. A light dark wash over the left column
        only - the text's real protection is the tight halo behind it (below),
        so this layer stays thin and lets the photo read through. Clears
        completely on the right. Black rather than `--background` because that
        token is near-white in light mode; the veil has to stay dark in both
        themes. Pointer-transparent so it never intercepts clicks.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/45 via-black/15 to-transparent"
      />

      <div className="relative z-10 mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
        {/*
          Text-protection halo. Instead of veiling the whole photo (which
          dulls the slideshow), a black panel sits directly behind the copy
          block and fades out toward its edges - near-solid where the words
          are, transparent a short way beyond them. The falloff starts at 45%
          of the panel's radius rather than 55%, so the photo opens up sooner
          outside the text. Black rather than `--background` because that token
          is near-white in light mode; the halo has to stay dark in both themes
          to sit under white copy. The wrapper's `z-10` forms a stacking
          context, so `-z-10` parks it behind the text but still above the
          photo layer. It stretches across most of the width on phones, where
          the copy is full-bleed, and tightens to the text column from `sm`.
        */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-20 right-0 -bottom-20 -left-20 -z-10 rounded-[4rem] bg-[radial-gradient(closest-side,color-mix(in_oklab,black,transparent_12%),color-mix(in_oklab,black,transparent_50%)_45%,transparent)] blur-2xl sm:right-1/4"
        />
        <div className="max-w-xl space-y-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/25 px-3 py-1 text-xs font-medium text-white">
            <span
              aria-hidden="true"
              className="bg-primary size-2 rounded-full"
            />
            Fresh laundry, picked up and delivered
          </span>
          <h1 className="font-display text-3xl leading-tight font-bold tracking-tight text-balance text-white sm:text-4xl lg:text-5xl">
            Laundry pickup and delivery, sorted.
            <span
              aria-hidden="true"
              className="mt-2 block h-1 w-24 rounded-full bg-gradient-to-r from-[var(--primary)] via-[var(--primary)] to-[var(--accent)]"
            />
          </h1>
          <p className="max-w-prose text-lg text-white">
            Book an hourly slot, we collect from your door and return everything
            fresh. Track every step from pickup to delivery.
          </p>
          {/*
            Full-width buttons below `sm`, where two side-by-side `size="lg"`
            CTAs would each be squeezed under ~150px.
          */}
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button
              asChild
              size="lg"
              className="w-full shadow-[0_8px_24px_-8px_var(--primary)] sm:w-auto"
            >
              <Link href="/book">Book Now</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="w-full sm:w-auto"
            >
              <a href="#services">Services</a>
            </Button>
          </div>
          <p className="text-sm text-white/80">
            Free pickup and delivery within {siteConfig.deliveryRadiusKm} km.
          </p>
        </div>

        {/*
          Three cards using the About stats anatomy (icon, value, label) in the
          glass treatment About uses over photography, so they stay legible on
          the slideshow. `grid-cols-3` holds down to 320px thanks to the
          tighter gap below `sm`. A gentle hover lift adds life without
          changing layout.
        */}
        <dl className="mt-6 grid max-w-lg grid-cols-3 gap-1.5 sm:gap-2">
          {STATS.map((stat) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.label}
                className="border-border bg-card/85 rounded-xl border p-2 text-center shadow-sm backdrop-blur-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md sm:p-2.5"
              >
                <Icon
                  aria-hidden="true"
                  className="text-primary mx-auto size-4"
                />
                <dt className="sr-only">{stat.label}</dt>
                <dd className="font-display mt-1 text-sm font-bold sm:text-base">
                  {stat.value}
                </dd>
                <dd className="text-muted-foreground text-[0.625rem] leading-tight sm:text-[0.6875rem]">
                  {stat.label}
                </dd>
              </div>
            );
          })}
        </dl>
      </div>
    </section>
  );
}
