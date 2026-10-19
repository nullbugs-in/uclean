import { Info, MapPin, Tag, type LucideIcon } from "lucide-react";

export type NavLink = {
  label: string;
  href: string;
  icon: LucideIcon;
};

/**
 * The site's primary navigation links, in display order.
 *
 * One source of truth shared by the navbar (desktop row and mobile panel) and
 * the footer's Quick links column, so the two can never drift apart - they used
 * to be separate lists in separate files.
 *
 * Icons are only rendered by the mobile panel; the footer uses label/href.
 */
export const NAV_LINKS = [
  { label: "About", href: "/#about", icon: Info },
  { label: "Pricing", href: "/pricing", icon: Tag },
  { label: "Contact", href: "/#contact", icon: MapPin },
] as const satisfies readonly NavLink[];
