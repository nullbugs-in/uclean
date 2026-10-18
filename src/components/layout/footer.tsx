import Image from "next/image";
import Link from "next/link";
import { Clock, Instagram, Mail, MapPin, Phone } from "lucide-react";

import { formattedAddress, openingHoursRows, siteConfig } from "@/config/site";
import { NAV_LINKS } from "@/config/nav";

/**
 * Quick links are the navbar's links, shared from `@/config/nav` - the footer
 * used to carry its own longer list (Services, Why UClean, Book Now) that the
 * header never showed.
 */

/**
 * Thin brand rule that caps the top of the footer, matching the one over the
 * contact form and map so the whole page reads as one set.
 */
const TOP_RULE =
  "absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[var(--primary)] via-[var(--primary)] to-[var(--accent)]";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-border relative overflow-hidden border-t bg-gradient-to-br from-[var(--accent)] via-[var(--secondary)]/70 to-[var(--background)]">
      {/* Soft lime glows, matching the Hero and About sections. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -left-24 size-[26rem] rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--primary),transparent_88%),transparent)] blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -bottom-28 size-[30rem] rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--accent),transparent_86%),transparent)] blur-3xl"
      />
      <span aria-hidden="true" className={TOP_RULE} />

      <div className="relative mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-2 md:py-14 lg:grid-cols-4">
        <div className="space-y-3">
          <Link
            href="/#hero"
            className="inline-block rounded-md"
            aria-label={`${siteConfig.name} home`}
          >
            {/* The lockup carries the wordmark, so no text name is repeated. */}
            <Image
              src={siteConfig.logo.src}
              alt=""
              width={siteConfig.logo.width}
              height={siteConfig.logo.height}
              className="h-12 w-auto"
            />
          </Link>
          <p className="text-muted-foreground max-w-xs text-sm">
            {siteConfig.tagline} Free pickup and delivery within{" "}
            {siteConfig.deliveryRadiusKm} km.
          </p>
          <ul className="flex gap-2 pt-2">
            {siteConfig.social.map((item) => (
              <li key={item.label}>
                <a
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${siteConfig.name} on ${item.label}`}
                  className="border-border text-muted-foreground hover:border-primary/50 hover:text-foreground hover:shadow-primary/30 grid size-9 place-items-center rounded-full border text-sm font-semibold transition-all hover:shadow-md"
                >
                  <Instagram aria-hidden="true" className="size-4" />
                </a>
              </li>
            ))}
          </ul>
        </div>

        <nav aria-label="Footer" className="space-y-3">
          <p className="text-sm font-semibold">Quick links</p>
          <ul className="text-muted-foreground space-y-2 text-sm">
            {NAV_LINKS.map((link) => (
              <li key={link.label}>
                <Link
                  href={link.href}
                  className="hover:text-foreground rounded transition-colors"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-3">
          <p className="text-sm font-semibold">Visit us</p>
          <ul className="text-muted-foreground space-y-2 text-sm">
            <li className="flex gap-2">
              <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>{formattedAddress()}</span>
            </li>
            <li className="flex gap-2">
              <Phone aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <a
                href={`tel:${siteConfig.phone.replace(/\s/g, "")}`}
                className="hover:text-foreground rounded transition-colors"
              >
                {siteConfig.phone}
              </a>
            </li>
            <li className="flex gap-2">
              <Mail aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <a
                href={`mailto:${siteConfig.email}`}
                className="hover:text-foreground rounded break-all transition-colors"
              >
                {siteConfig.email}
              </a>
            </li>
          </ul>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-semibold">Opening hours</p>
          <ul className="text-muted-foreground space-y-2 text-sm">
            {openingHoursRows().map((entry) => (
              <li key={entry.days} className="flex gap-2">
                <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <span>
                  {entry.days}: {entry.hours}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-border relative border-t">
        <div className="text-muted-foreground mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-6 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            &copy; {year} {siteConfig.name}. All rights reserved.
          </p>
          <div className="flex gap-4">
            <a
              href="#"
              className="hover:text-foreground rounded transition-colors"
            >
              Privacy
            </a>
            <a
              href="#"
              className="hover:text-foreground rounded transition-colors"
            >
              Terms
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
