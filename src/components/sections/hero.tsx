"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
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

export function Hero() {
  const count = heroSlides.length;
  const [index, setIndex] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const startX = useRef<number | null>(null);
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  );

  const running = !userPaused && !interacting && !reducedMotion;

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
    <section className="border-border relative overflow-hidden border-b bg-gradient-to-b from-[var(--accent)]/60 to-[var(--background)] lg:flex lg:min-h-[calc(100dvh-4rem)] lg:items-center">
      {/* Logo-colour static glows */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[28rem] bg-[radial-gradient(60%_100%_at_50%_0%,color-mix(in_oklab,var(--primary),transparent_75%),transparent)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -left-20 -z-10 size-[28rem] rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--primary),transparent_82%),transparent)] blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-28 -right-24 -z-10 size-[30rem] rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--primary),transparent_80%),transparent)] blur-3xl"
      />
      {/*
        `min-w-0` on both children is load-bearing. Grid items default to
        `min-width: auto`, so the carousel track - a flex row of three
        `w-full shrink-0` slides - reports a min-content width of roughly 585px
        and would widen the column past the viewport. The section's
        `overflow-hidden` then clips the overflow instead of scrolling it, which
        hid the damage from a `scrollWidth` check. With `min-w-0` the column can
        shrink and the track is laid out against the real container width.
      */}
      <div className="relative z-10 mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 lg:py-0">
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
          {/* Carousel halo */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-x-6 -inset-y-4 -z-10 rounded-[2rem] bg-[radial-gradient(60%_60%_at_50%_30%,color-mix(in_oklab,var(--primary),transparent_70%),transparent)] blur-3xl"
          />
          <div className="overflow-hidden rounded-3xl">
            <div
              className="flex transition-transform duration-500 ease-out"
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
                      Photo layer, first child so the gradient tint and the
                      scrim below both paint over it. `fill` plus the card's
                      own aspect ratio means each slide is cropped rather than
                      distorted - the three photos have different aspect ratios
                      (3:2, 1:1, 4:5) and are cropped to 4:5 on mobile and 16:10
                      from `sm`.

                      The `sizes` hint matters for how aggressively next/image
                      picks a source width: the card is full-bleed on phones and
                      roughly half the container from `md` up. If this carousel
                      ever grows much past a handful of slides, revisit this
                      alongside formats - WebP/AVIF and a responsive `sizes`
                      strategy are the lever, since a `fill` image with a
                      coarse hint will happily serve a 1200px bitmap to a phone.
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
                      clear 4.5:1; a gradient that is darkest at the bottom
                      where the text is and lightest at the top keeps the badge
                      area from muddying. Also the visual equaliser across three
                      very different photos - a light subject on one slide would
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

          <div className="mt-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <CarouselButton
                label="Previous slide"
                onClick={() => goTo(index - 1)}
              >
                <ChevronLeft aria-hidden="true" className="size-5" />
              </CarouselButton>
              <CarouselButton
                label="Next slide"
                onClick={() => goTo(index + 1)}
              >
                <ChevronRight aria-hidden="true" className="size-5" />
              </CarouselButton>
              <button
                type="button"
                onClick={() => setUserPaused((value) => !value)}
                aria-label={userPaused ? "Resume slideshow" : "Pause slideshow"}
                className="border-border bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground grid size-9 place-items-center rounded-full border transition-colors"
              >
                {userPaused ? (
                  <Play aria-hidden="true" className="size-4" />
                ) : (
                  <Pause aria-hidden="true" className="size-4" />
                )}
              </button>
            </div>

            <div className="flex items-center gap-2">
              {heroSlides.map((slide, slideIndex) => (
                <button
                  key={slide.id}
                  type="button"
                  onClick={() => goTo(slideIndex)}
                  aria-label={`Go to slide ${slideIndex + 1}: ${slide.title}`}
                  aria-current={slideIndex === index}
                  className={cn(
                    "h-2.5 rounded-full transition-all",
                    slideIndex === index
                      ? "bg-primary w-6"
                      : "bg-border hover:bg-muted-foreground/50 w-2.5",
                  )}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CarouselButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="border-border bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground grid size-9 place-items-center rounded-full border transition-colors"
    >
      {children}
    </button>
  );
}
