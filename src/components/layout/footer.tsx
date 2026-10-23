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

/**
 * The official Google "G", drawn with `currentColor` so it inherits exactly
 * what the lucide Instagram glyph beside it inherits: the muted-chip gray at
 * rest and the foreground tint on hover. Fill rather than stroke because the
 * G's four strokes are solid shapes, not line art. Sits inside the same
 * `aria-hidden` social chip the list renders for every entry.
 */
function GoogleBusinessIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-4"
      fill="currentColor"
    >
      <path d="M21.35 12.18c0-.67-.06-1.32-.17-1.94H12v3.68h5.24a4.48 4.48 0 0 1-1.94 2.94v2.44h3.14c1.84-1.69 2.91-4.19 2.91-7.12z" />
      <path d="M12 22c2.61 0 4.8-.86 6.4-2.34l-3.14-2.44c-.86.58-1.97.92-3.26.92-2.51 0-4.63-1.69-5.4-3.96H3.36v2.52A8.53 8.53 0 0 0 12 22z" />
      <path d="M6.6 14.18A5.12 5.12 0 0 1 6.6 9.82V7.3H3.36a8.54 8.54 0 0 0 0 7.4l3.24-2.52z" />
      <path d="M12 5.86c1.42 0 2.69.49 3.7 1.45l2.77-2.77C16.79 2.89 14.6 2 12 2a8.53 8.53 0 0 0-8.64 5.3l3.24 2.52c.77-2.27 2.89-3.96 5.4-3.96z" />
    </svg>
  );
}

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
                  {item.label === "Instagram" ? (
                    <Instagram aria-hidden="true" className="size-4" />
                  ) : (
                    <GoogleBusinessIcon />
                  )}
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
              href="https://nullbugs.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground rounded transition-colors"
            >
              Powered by Null Bugs
            </a>
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
