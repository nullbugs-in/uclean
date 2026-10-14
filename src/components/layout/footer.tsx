import Image from "next/image";
import Link from "next/link";
import { Clock, Mail, MapPin, Phone } from "lucide-react";

import { formattedAddress, siteConfig } from "@/config/site";

const QUICK_LINKS = [
  { label: "About", href: "/#about" },
  { label: "Services", href: "/#services" },
  { label: "Why UClean", href: "/#why" },
  { label: "Contact", href: "/#contact" },
  { label: "Book Now", href: "/book" },
] as const;

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-border bg-card border-t">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-3">
          <Link
            href="/"
            className="inline-block rounded-md"
            aria-label={`${siteConfig.name} home`}
          >
            {/* The lockup carries the wordmark, so no text name is repeated. */}
            <Image
              src={siteConfig.logo.src}
              alt=""
              width={siteConfig.logo.width}
              height={siteConfig.logo.height}
              className="h-10 w-auto"
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
                  aria-label={item.label}
                  className="border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground grid size-9 place-items-center rounded-full border text-sm font-semibold transition-colors"
                >
                  {item.label.charAt(0)}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <nav aria-label="Footer" className="space-y-3">
          <p className="text-sm font-semibold">Quick links</p>
          <ul className="text-muted-foreground space-y-2 text-sm">
            {QUICK_LINKS.map((link) => (
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
                href={`mailto:hello@${new URL(siteConfig.url).hostname}`}
                className="hover:text-foreground rounded transition-colors"
              >
                hello@{new URL(siteConfig.url).hostname}
              </a>
            </li>
          </ul>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-semibold">Opening hours</p>
          <ul className="text-muted-foreground space-y-2 text-sm">
            {siteConfig.openingHours.map((entry) => (
              <li key={entry.days} className="flex gap-2">
                <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <span>
                  {entry.days}: {entry.opens} - {entry.closes}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-border border-t">
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
