"use client";

import Image from "next/image";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { label: "About", href: "/#about" },
  { label: "Services", href: "/#services" },
  { label: "Pricing", href: "/pricing" },
  { label: "Why UClean", href: "/#why" },
  { label: "Contact", href: "/#contact" },
] as const;

/** Soft lime glow cast by the primary CTAs. */
const CTA_GLOW = "shadow-[0_8px_24px_-8px_var(--primary)]";

export function Navbar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  /*
   * Only route links can be highlighted from the pathname. The `/#section`
   * anchors all share "/" as their path, so marking them active on the home
   * page would light up every anchor at once - they stay hover-only instead.
   */
  function isActive(href: string) {
    return href === pathname || pathname.startsWith(`${href}/`);
  }

  return (
    <header className="border-border bg-background/85 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-40 border-b shadow-[0_8px_24px_-16px_rgba(0,0,0,0.25)] backdrop-blur">
      {/* Decorative brand wash, hidden from assistive tech. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_100%_at_50%_0%,var(--accent),transparent)] opacity-60"
      />

      <div className="relative mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 md:grid md:grid-cols-[1fr_auto_1fr] md:justify-normal">
        <Link
          href="/"
          className="group flex items-center rounded-md"
          aria-label={`${siteConfig.name} home`}
        >
          {/*
            The lockup already contains the UCLEAN wordmark, so it replaces the
            old droplet tile plus text name rather than sitting beside them.
            alt is empty because the link carries the accessible name; the
            header is above the fold, hence priority.
          */}
          <Image
            src={siteConfig.logo.src}
            alt=""
            width={siteConfig.logo.width}
            height={siteConfig.logo.height}
            priority
            className="h-9 w-auto transition-transform duration-200 group-hover:scale-[1.03] md:h-10"
          />
        </Link>

        <nav
          aria-label="Primary"
          className="bg-secondary/60 hidden items-center gap-1 rounded-full p-1 md:flex"
        >
          {NAV_LINKS.map((link) => {
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-medium transition-all",
                  active
                    ? "bg-primary/15 text-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-background hover:text-foreground hover:shadow-sm",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center justify-end gap-2 md:flex">
          <Button asChild variant="outline" size="sm">
            <Link href="/auth/login?redirect=/account">Log in</Link>
          </Button>
          <Button asChild size="sm" className={cn(CTA_GLOW, "hover:-translate-y-0.5 transition-all")}>
            <Link href="/auth/signup">Sign up</Link>
          </Button>
          <Button
            asChild
            size="sm"
            className={cn(CTA_GLOW, "hover:-translate-y-0.5 transition-all")}
          >
            <Link href="/book">Book Now</Link>
          </Button>
        </div>

        <button
          type="button"
          className="border-border text-foreground hover:bg-accent grid size-10 place-items-center rounded-full border transition-colors md:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
      </div>

      <div
        id="mobile-menu"
        hidden={!open}
        className="border-border bg-background border-t md:hidden"
      >
        <nav
          aria-label="Mobile"
          className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-4 sm:px-6"
        >
          {NAV_LINKS.map((link) => {
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={cn(
                  "rounded-md px-3 py-3 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/15 text-foreground"
                    : "text-foreground hover:bg-accent",
                )}
              >
                {link.label}
              </Link>
            );
          })}
          <div className="mt-3 flex flex-col gap-2">
            <Button asChild className={cn("h-11 w-full", CTA_GLOW)}>
              <Link href="/auth/signup" onClick={() => setOpen(false)}>
                Sign up
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-11 w-full">
              <Link href="/auth/login?redirect=/account" onClick={() => setOpen(false)}>
                Log in
              </Link>
            </Button>
            <Button asChild className={cn("h-11 w-full", CTA_GLOW)}>
              <Link href="/book" onClick={() => setOpen(false)}>
                Book Now
              </Link>
            </Button>
          </div>
        </nav>
      </div>
    </header>
  );
}