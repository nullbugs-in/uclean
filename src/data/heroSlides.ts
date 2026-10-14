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
    icon: Footprints,
    ctaHref: "/book",
  },
  {
    id: "curtain-cleaning",
    title: "Curtain Cleaning",
    tagline: "Dust-free, fresh curtains with careful handling and re-hanging.",
    badge: "Careful handling",
    gradient: "from-emerald-200 via-lime-100 to-amber-50",
    icon: Blinds,
    ctaHref: "/book",
  },
];
