"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarClock, ChevronDown, Menu, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  getMyBookingsAction,
  type MyBookings,
} from "@/app/(account)/account-actions";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { OrderTimeline } from "@/components/order-timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import { CUSTOMER_STATUS_LABEL } from "@/lib/order-status";
import { formatDate, cn } from "@/lib/utils";

const NAV_LINKS = [
  { label: "About", href: "/#about" },
  { label: "Services", href: "/#services" },
  { label: "Pricing", href: "/pricing" },
  { label: "Why UClean", href: "/#why" },
  { label: "Contact", href: "/#contact" },
] as const;

/** Soft lime glow cast by the primary CTAs. */
const CTA_GLOW = "shadow-[0_8px_24px_-8px_var(--primary)]";

export type NavbarUser = {
  fullName: string;
  mobile: string;
  role: string;
};

export function Navbar({ user = null }: { user?: NavbarUser | null }) {
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

      {/*
        The three-zone row only appears from `lg`. At `md` the logo, the pill nav
        and the auth controls together measure ~784px, which overflows the
        ~736px available at 768px. Tablets therefore get the compact cluster
        below instead, which still offers a CTA without risking a horizontal
        scrollbar.
      */}
      <div className="relative mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:grid lg:grid-cols-[1fr_auto_1fr]">
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
            className="h-10 w-auto transition-transform duration-200 group-hover:scale-[1.03] sm:h-12"
          />
        </Link>

        <nav
          aria-label="Primary"
          className="bg-secondary/60 hidden items-center gap-1 rounded-full p-1 lg:flex"
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

        <div className="hidden items-center justify-end gap-2 lg:flex">
          <AuthControls user={user} />
        </div>

        {/*
          Compact row for phones and tablets. There is no CTA here, so the
          hamburger is the only control beside the logo; navigation and the auth
          controls live in the panel below.
        */}
        <div className="flex items-center gap-2 lg:hidden">
          <button
            type="button"
            className="border-border text-foreground hover:bg-accent grid size-10 place-items-center rounded-full border transition-colors"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </div>
      </div>

      <div
        id="mobile-menu"
        hidden={!open}
        className="border-border bg-background border-t lg:hidden"
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

          {user ? (
            <div className="mt-3 flex flex-col gap-2">
              <div className="bg-muted/60 flex items-center gap-3 rounded-xl px-3 py-3">
                <span
                  aria-hidden="true"
                  className="ring-primary/40 bg-primary/20 grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold ring-2"
                >
                  {initialsOf(user.fullName)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {user.fullName}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {user.mobile} · {user.role}
                  </p>
                </div>
              </div>
              <Button asChild className="h-11 w-full">
                <Link
                  href="/account/profile"
                  onClick={() => setOpen(false)}
                  className="justify-center"
                >
                  User profile
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-11 w-full">
                <Link
                  href="/account/orders"
                  onClick={() => setOpen(false)}
                  className="justify-center"
                >
                  My bookings
                </Link>
              </Button>
              <SignOutButton />
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              <Button asChild className={cn("h-11 w-full", CTA_GLOW)}>
                <Link href="/auth/signup" onClick={() => setOpen(false)}>
                  Sign up
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-11 w-full">
                <Link
                  href="/auth/login?redirect=/"
                  onClick={() => setOpen(false)}
                >
                  Log in
                </Link>
              </Button>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}

/**
 * Log in / Sign up while signed out; the profile icon and sign out once signed
 * in. The session is resolved by (public)/layout.tsx and passed in, because the
 * navbar is a client component and cannot read cookies itself.
 */
function AuthControls({ user }: { user: NavbarUser | null }) {
  if (!user) {
    return (
      <>
        <Button asChild variant="outline" size="sm">
          <Link href="/auth/login?redirect=/">Log in</Link>
        </Button>
        <Button
          asChild
          size="sm"
          className={cn(CTA_GLOW, "transition-all hover:-translate-y-0.5")}
        >
          <Link href="/auth/signup">Sign up</Link>
        </Button>
      </>
    );
  }

  return (
    <>
      <UserMenu user={user} />
      <SignOutButton />
    </>
  );
}

function initialsOf(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return "?";
  const last = parts.length > 1 ? parts[parts.length - 1] : undefined;
  if (!last) return first.slice(0, 2).toUpperCase();
  return `${first[0]}${last[0]}`.toUpperCase();
}

/** Which panel, if any, is expanded inside the dropdown. */
type Panel = "none" | "profile" | "bookings";

/**
 * The profile icon and its dropdown.
 *
 * Both rows expand a panel in place instead of navigating, so the details can
 * be read without leaving the page. Escape or a click outside closes the menu.
 */
function UserMenu({ user }: { user: NavbarUser }) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>("none");
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [bookings, setBookings] = useState<MyBookings | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  // Fetched on first expand rather than on mount, so an ordinary visit to any
  // public page never runs the query.
  async function openBookings() {
    setPanel((current) => (current === "bookings" ? "none" : "bookings"));

    if (loaded || loading) return;

    setLoading(true);
    try {
      setBookings(await getMyBookingsAction());
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }

  function togglePanel(next: Exclude<Panel, "none">) {
    setPanel((current) => (current === next ? "none" : next));
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${user.fullName}`}
        onClick={() => setOpen((value) => !value)}
        className="ring-primary/40 bg-primary/20 grid size-9 place-items-center rounded-full text-xs font-semibold transition-shadow hover:ring-2 focus-visible:ring-2 focus-visible:outline-none"
      >
        <span aria-hidden="true">{initialsOf(user.fullName)}</span>
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Account"
          className="bg-card border-border absolute right-0 z-50 mt-2 w-96 origin-top-right rounded-2xl border p-2 shadow-lg"
        >
          <MenuRow
            icon={<UserRound className="size-4" aria-hidden="true" />}
            label="Profile details"
            expanded={panel === "profile"}
            onToggle={() => togglePanel("profile")}
          />

          {panel === "profile" ? (
            <div className="border-border space-y-2 border-t px-3 pt-3 pb-1">
              <div>
                <p className="text-muted-foreground text-xs">Name</p>
                <p className="text-sm font-medium">{user.fullName}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Mobile</p>
                <p className="text-sm font-medium">{user.mobile}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Account type</p>
                <p className="text-sm font-medium capitalize">{user.role}</p>
              </div>
              <div className="flex items-center justify-between pt-1">
                <Link
                  href="/account/profile"
                  onClick={() => setOpen(false)}
                  className="text-primary text-sm font-medium hover:underline"
                >
                  Edit profile
                </Link>
                <Link
                  href="/account/orders"
                  onClick={() => setOpen(false)}
                  className="text-primary text-sm font-medium hover:underline"
                >
                  All orders
                </Link>
              </div>
            </div>
          ) : null}

          <MenuRow
            icon={<CalendarClock className="size-4" aria-hidden="true" />}
            label="My bookings"
            expanded={panel === "bookings"}
            onToggle={() => void openBookings()}
          />

          {panel === "bookings" ? (
            <div className="border-border max-h-80 space-y-3 overflow-y-auto border-t px-3 pt-3 pb-1">
              {loading ? (
                <p className="text-muted-foreground text-sm">Loading…</p>
              ) : !bookings?.latest ? (
                <p className="text-muted-foreground text-sm">
                  You have no active orders. Book a pickup and it will show up
                  here.
                </p>
              ) : (
                <BookingsPanel booking={bookings.latest} />
              )}
            </div>
          ) : null}

          <div className="border-border mt-2 border-t pt-2">
            <SignOutButton />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * A dropdown row that expands a panel rather than navigating.
 *
 * A button, not a link: it performs an in-place reveal, so a link would be
 * misleading and the keyboard behaviour would be wrong.
 */
function MenuRow({
  icon,
  label,
  expanded,
  onToggle,
}: {
  icon: React.ReactNode;
  label: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      aria-expanded={expanded}
      onClick={onToggle}
      className="hover:bg-accent flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors"
    >
      {icon}
      <span className="flex-1">{label}</span>
      <ChevronDown
        aria-hidden="true"
        className={cn(
          "text-muted-foreground size-4 transition-transform",
          expanded && "rotate-180",
        )}
      />
    </button>
  );
}

function BookingsPanel({
  booking,
}: {
  booking: NonNullable<MyBookings["latest"]>;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs">{booking.orderNo}</span>
        <Badge variant="secondary">
          {CUSTOMER_STATUS_LABEL[booking.status]}
        </Badge>
      </div>

      <dl className="text-muted-foreground space-y-1 text-xs">
        <div className="flex justify-between gap-2">
          <dt>Pickup</dt>
          <dd className="text-foreground font-medium">
            {formatDate(booking.pickupDate)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="shrink-0">Address</dt>
          <dd className="text-foreground truncate text-right font-medium">
            {booking.address}
          </dd>
        </div>
      </dl>

      <OrderTimeline status={booking.status} history={booking.history} />

      <Link
        href={`/account/orders/${booking.orderId}`}
        className="text-primary inline-block text-xs font-medium hover:underline"
      >
        Open full tracking
      </Link>
    </div>
  );
}
