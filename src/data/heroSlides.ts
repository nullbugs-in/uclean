/**
 * Hero poster carousel content.
 *
 * This array is the ONLY thing that changes to add a slide - the carousel
 * renders whatever is here. New cards arrive in the next phase by appending
 * items; no layout or component changes are required.
 */

import { Blinds, Footprints, Zap, type LucideIcon } from "lucide-react";

export type HeroSlide = {
  id: string;
  /** Short headline shown large on the poster. */
  title: string;
  /** One-line supporting copy. */
  tagline: string;
  /** Small pill above the title, e.g. "Fast turnaround". */
  badge: string;
  /** Tailwind gradient utility classes for the poster background. */
  gradient: string;
  /**
   * Optional photo from `public/`, drawn behind the gradient as the poster
   * background.
   *
   * Intrinsic dimensions are declared so next/image can reserve the box before
   * the bitmap arrives and avoid a layout shift, matching the convention used
   * for `siteConfig.logo`.
   *
   * The photos have mismatched aspect ratios (3:2, 1:1, 4:5) against a card
   * that is 4:5 on mobile and 16:10 from `sm`, so the card crops rather than
   * distorts. When this list grows beyond a handful of slides, revisit sizing
   * and formats here - see the note at the image layer in hero.tsx.
   */
  image?: {
    src: string;
    width: number;
    height: number;
  };
  icon: LucideIcon;
  /** Where the slide's primary action points. */
  ctaHref: string;
};

export const heroSlides: HeroSlide[] = [
  {
    id: "express",
    title: "Express Service",
    tagline: "Same-day pickup and a 24-hour turnaround when you need it now.",
    badge: "Fast turnaround",
    gradient: "from-lime-300 via-lime-200 to-sky-100",
    image: { src: "/expressservices.jpg", width: 1000, height: 667 },
    icon: Zap,
    ctaHref: "/book",
  },
  {
    id: "shoe-cleaning",
    title: "Shoe Cleaning",
    tagline:
      "Deep-clean, deodorise and polish - from sneakers to formal pairs.",
    badge: "Deep clean",
    gradient: "from-sky-200 via-cyan-100 to-lime-100",
    image: { src: "/shoescleaning.jpg", width: 1200, height: 1200 },
    icon: Footprints,
    ctaHref: "/book",
  },
  {
    id: "curtain-cleaning",
    title: "Curtain Cleaning",
    tagline: "Dust-free, fresh curtains with careful handling and re-hanging.",
    badge: "Careful handling",
    gradient: "from-emerald-200 via-lime-100 to-amber-50",
    image: { src: "/curtaincleaning.jpg", width: 736, height: 920 },
    icon: Blinds,
    ctaHref: "/book",
  },
];
