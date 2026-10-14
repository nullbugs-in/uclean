"use client";

import Image from "next/image";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";

import { siteConfig } from "@/config/site";

const NAV_LINKS = [
  { label: "About", href: "/#about" },
  { label: "Services", href: "/#services" },
  { label: "Why UClean", href: "/#why" },
  { label: "Contact", href: "/#contact" },
] as const;

export function Navbar() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <header className="border-border bg-background/85 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center rounded-md"
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
            className="h-9 w-auto"
          />
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded-md px-3 py-2 text-sm font-medium transition-colors"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/book"
            className="bg-primary text-primary-foreground ml-2 inline-flex h-9 items-center rounded-md px-4 text-sm font-semibold transition-transform hover:-translate-y-0.5"
          >
            Book Now
          </Link>
        </nav>

        <button
          type="button"
          className="text-foreground hover:bg-accent grid size-10 place-items-center rounded-md transition-colors md:hidden"
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
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="text-foreground hover:bg-accent rounded-md px-3 py-3 text-sm font-medium transition-colors"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/book"
            onClick={() => setOpen(false)}
            className="bg-primary text-primary-foreground mt-2 inline-flex h-11 items-center justify-center rounded-md px-4 text-sm font-semibold"
          >
            Book Now
          </Link>
        </nav>
      </div>
    </header>
  );
}
