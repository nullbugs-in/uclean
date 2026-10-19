"use client";

import Image from "next/image";
import Link from "next/link";
import { CalendarClock, Radar, Truck } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import { heroSlides } from "@/data/heroSlides";
import { cn } from "@/lib/utils";

const AUTOPLAY_MS = 5000;
const SWIPE_THRESHOLD_PX = 40;
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
 * Same icon/value/label anatomy as the About section's stats, so the two sections
 * read as one family. Values come from `siteConfig` where they exist so there is
 * a single source of truth.
 *
 * Plain cards rather than the glass treatment this row wore when it sat over the
 * full-bleed slideshow: with the photos inside the carousel cards, these are on
 * the page background and a backdrop blur over nothing is just a heavier paint.
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
  const count = heroSlides.length;
  const [index, setIndex] = useState(0);
  const [interacting, setInteracting] = useState(false);
  const startX = useRef<number | null>(null);
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  );

  /*
   * Autoplay stops for the three reasons that matter, all of them the same one:
   * the slide changing while somebody is reading it. They have hovered or focused
   * the carousel, they have swiped it, or they have asked for reduced motion.
   *
   * Focus is the load-bearing case here. There is no pause button in this layout,
   * so tabbing into the region is the only way somebody using a keyboard stops
   * the carousel moving under them - which is also why the region is focusable
   * rather than a plain div.
   */
  const running = !interacting && !reducedMotion;

  useEffect(() => {
    if (!running || count < 2) return;
    const id = window.setInterval(
      () => setIndex((current) => (current + 1) % count),
      AUTOPLAY_MS,
    );
    return () => window.clearInterval(id);
  }, [running, count]);

  function goTo(next: number) {
    setIndex(((next % count) + count) % count);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goTo(index - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      goTo(index + 1);
    }
  }

  function onPointerDown(event: PointerEvent) {
    startX.current = event.clientX;
    setInteracting(true);
  }

  function onPointerUp(event: PointerEvent) {
    if (startX.current !== null) {
      const delta = event.clientX - startX.current;
      if (Math.abs(delta) > SWIPE_THRESHOLD_PX) {
        goTo(index + (delta < 0 ? 1 : -1));
      }
    }
    startX.current = null;
    setInteracting(false);
  }

  if (count === 0) return null;

  return (
    <section
      id="hero"
      className="border-border relative scroll-mt-20 overflow-hidden border-b bg-gradient-to-b from-[var(--accent)]/60 to-[var(--background)] lg:flex lg:min-h-[calc(100dvh-4rem)] lg:items-center"
    >
      {/*
        `min-w-0` on both children is load-bearing. Grid items default to
        `min-width: auto`, so the carousel track - a flex row of `w-full
        shrink-0` slides - reports a min-content width of roughly 585px and would
        widen the column past the viewport. The section's `overflow-hidden` then
        clips the overflow instead of scrolling it, which hid the damage from a
        `scrollWidth` check. With `min-w-0` the column can shrink and the track is
        laid out against the real container width.
      */}
      <div className="relative mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 lg:min-h-[calc(100dvh-4rem)] lg:py-24">
        <div className="min-w-0 space-y-6">
          <span className="border-primary/30 bg-primary/15 text-foreground inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium">
            <span
              aria-hidden="true"
              className="bg-primary size-2 rounded-full"
            />
            Fresh laundry, picked up and delivered
          </span>

          <h1 className="font-display text-3xl leading-tight font-bold tracking-tight text-balance sm:text-4xl lg:text-5xl">
            Laundry pickup and delivery, sorted.
            <span
              aria-hidden="true"
              className="mt-2 block h-1 w-24 rounded-full bg-gradient-to-r from-[var(--primary)] via-[var(--primary)] to-[var(--accent)]"
            />
          </h1>

          <p className="text-muted-foreground max-w-prose text-lg">
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

          <p className="text-muted-foreground text-sm">
            Free pickup and delivery within {siteConfig.deliveryRadiusKm} km.
          </p>
        </div>

        <div
          role="region"
          aria-roledescription="carousel"
          aria-label="Featured services"
          tabIndex={0}
          onKeyDown={onKeyDown}
          onMouseEnter={() => setInteracting(true)}
          onMouseLeave={() => setInteracting(false)}
          onFocus={() => setInteracting(true)}
          onBlur={() => setInteracting(false)}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          className="focus-visible:outline-ring relative min-w-0 rounded-3xl focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          <div className="overflow-hidden rounded-3xl">
            {/*
              One track, translated rather than re-rendered, so the slide change
              is a movement the eye can follow instead of a cut. `aria-live` is
              off while it is moving on its own and polite once it stops, because
              an announcement every five seconds is noise rather than news.
            */}
            <div
              className="flex transition-transform duration-500 ease-out motion-reduce:transition-none"
              style={{ transform: `translateX(-${index * 100}%)` }}
              aria-live={running ? "off" : "polite"}
            >
              {heroSlides.map((slide, slideIndex) => {
                const Icon = slide.icon;

                return (
                  <article
                    key={slide.id}
                    role="group"
                    aria-roledescription="slide"
                    aria-label={`${slideIndex + 1} of ${count}: ${slide.title}`}
                    aria-hidden={slideIndex !== index}
                    className={cn(
                      "relative flex aspect-4/5 w-full shrink-0 flex-col justify-between overflow-hidden bg-gradient-to-br p-6 select-none sm:aspect-16/10 sm:p-8",
                      slide.gradient,
                    )}
                  >
                    {/*
                      Photo layer, first child so the gradient tint and the scrim
                      below both paint over it. `fill` plus the card's own aspect
                      ratio means each slide is cropped rather than distorted -
                      the three photos have different aspect ratios (3:2, 1:1,
                      4:5) and are cropped to 4:5 on mobile and 16:10 from `sm`.

                      The `sizes` hint matters for how aggressively next/image
                      picks a source width: the card is full-bleed on phones and
                      roughly half the container from `md` up. If this carousel
                      ever grows much past a handful of slides, revisit this
                      alongside formats - WebP/AVIF and a responsive `sizes`
                      strategy are the lever, since a `fill` image with a coarse
                      hint will happily serve a 1200px bitmap to a phone.
                    */}
                    {slide.image ? (
                      <Image
                        src={slide.image.src}
                        alt=""
                        fill
                        priority={slideIndex === 0}
                        sizes="(max-width: 768px) 100vw, 50vw"
                        className="object-cover"
                      />
                    ) : null}

                    {/*
                      Legibility scrim. The copy sits over photography, so the
                      headline and tagline are white and need a dark base to
                      clear 4.5:1; a gradient that is darkest at the bottom where
                      the text is and lightest at the top keeps the badge area
                      from muddying. Also the visual equaliser across three very
                      different photos - a light subject on one slide would
                      otherwise swallow the white text where a dark one would
                      not.
                    */}
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/35 to-black/10"
                    />

                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute -top-16 -right-10 size-56 rounded-full bg-white/20 blur-2xl"
                    />
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute -bottom-20 -left-10 size-56 rounded-full bg-white/15 blur-2xl"
                    />

                    <div className="relative flex items-start justify-between gap-4">
                      <span className="text-primary-foreground inline-flex items-center rounded-full bg-white/80 px-3 py-1 text-xs font-semibold shadow-sm">
                        {slide.badge}
                      </span>
                      <span
                        aria-hidden="true"
                        className="text-primary-foreground grid size-14 place-items-center rounded-2xl bg-white/70 shadow-sm backdrop-blur-sm"
                      >
                        <Icon className="size-7" />
                      </span>
                    </div>

                    <div className="relative space-y-2">
                      <h2 className="font-display text-3xl font-bold tracking-tight text-white drop-shadow-sm sm:text-4xl">
                        {slide.title}
                      </h2>
                      <p className="max-w-sm text-sm font-medium text-white/90 drop-shadow-sm sm:text-base">
                        {slide.tagline}
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          {/*
            The three brand facts, under the poster rather than beside the copy.

            They moved here because the right column is the one with room: the
            carousel is a fixed aspect box, so a row of small cards beneath it
            reads as part of the same object, whereas beside the headline they
            pulled the copy column narrower than it needed to be.

            Short by construction. The icon shares a line with the value rather
            than sitting in a chip of its own: at three across, a card is about
            100px wide, and a 32px chip stacked above the number was a third of
            the card's height for decoration. Sharing the line takes the card
            from ~100px to ~65px, which is what makes it read as a caption to
            the poster instead of a panel competing with it.

            Everything is on the centre line. A left-aligned card in a centred
            row reads as a mistake rather than a choice.

            The wash is always faintly on and deepens on hover, so the row is
            visibly part of the palette at rest and still rewards a pointer.
            `grid-cols-3` holds down to 320px; the labels wrap to two lines
            there rather than shrinking the type any further.
          */}
          <dl className="mt-4 grid grid-cols-3 gap-2 sm:mt-5 sm:gap-3">
            {STATS.map((stat) => {
              const Icon = stat.icon;

              return (
                <div
                  key={stat.label}
                  className="group border-border bg-card relative flex flex-col items-center justify-center gap-1.5 overflow-hidden rounded-2xl border px-2 py-2.5 text-center shadow-sm transition duration-300 hover:-translate-y-0.5 hover:border-[var(--primary)]/40 hover:shadow-lg sm:gap-2 sm:px-3"
                >
                  {/*
                    Brand wash. Absolute and behind the content, so the text
                    never shifts when it deepens. Faint at rest, full strength
                    on hover.
                  */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--primary)]/10 to-[var(--accent)]/8 opacity-70 transition-opacity duration-300 group-hover:opacity-100"
                  />

                  {/*
                    Icon and value on one line. The glyph is tinted rather than
                    boxed, which is what buys the height back: a chip around it
                    would set a 32px floor on the row on its own.
                  */}
                  <span className="relative flex items-center justify-center gap-1.5">
                    <Icon
                      aria-hidden="true"
                      className="text-primary size-3.5 shrink-0 transition-colors duration-300 group-hover:text-[var(--accent)] sm:size-4"
                    />
                    <dd className="font-display text-sm leading-none font-bold sm:text-base">
                      {stat.value}
                    </dd>
                  </span>

                  <dt className="sr-only">{stat.label}</dt>
                  <dd className="text-muted-foreground relative text-[0.625rem] leading-tight sm:text-[0.6875rem]">
                    {stat.label}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      </div>
    </section>
  );
}
