"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Package, UserRound, Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { notificationLabel } from "@/db/queries/notifications";
import { SignOutLink } from "@/components/layout/sign-out-link";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import { formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { label: "About", href: "/#about" },
  { label: "Pricing", href: "/pricing" },
  { label: "Contact", href: "/#contact" },
] as const;

/** Soft lime glow cast by the primary CTAs. */
const CTA_GLOW = "shadow-[0_8px_24px_-8px_var(--primary)]";

export type NavbarUser = {
  fullName: string;
  mobile: string;
  role: string;
  /** True once the customer has placed at least one order. */
  hasBookings: boolean;
  /** Recent messages, for the notification bell. */
  notifications: {
    count: number;
    items: Array<{
      id: number;
      template: string;
      channel: string;
      created_at: string;
    }>;
  };
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
              <Button asChild className="h-11 w-full">
                <Link
                  href="/account/profile"
                  onClick={() => setOpen(false)}
                  className="justify-center"
                >
                  Profile details
                </Link>
              </Button>
              {user.hasBookings ? (
                <Button asChild variant="outline" className="h-11 w-full">
                  <Link
                    href="/account/orders"
                    onClick={() => setOpen(false)}
                    className="justify-center"
                  >
                    My bookings
                  </Link>
                </Button>
              ) : null}
              <SignOutLink className="[&_button]:h-11 [&_button]:w-full" />
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
 * Log in / Sign up while signed out; once signed in, a My bookings shortcut
 * (only when they have booked), the profile menu, and sign out.
 *
 * The session is resolved by (public)/layout.tsx and passed in, because the
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
      {/* Sign out first, then bookings, notifications and the profile menu. */}
      <SignOutLink variant="icon" />
      {user.hasBookings ? <BookingsIcon /> : null}
      <NotificationsBell notifications={user.notifications} />
      <UserMenu user={user} />
    </>
  );
}

/**
 * The notification bell.
 *
 * The badge counts messages from the last week rather than unread ones: the
 * `read` status exists in the schema but nothing writes it yet, so an unread
 * count would always read zero and the bell would look permanently empty.
 */
function NotificationsBell({
  notifications,
}: {
  notifications: NavbarUser["notifications"];
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { count, items } = notifications;

  useDismissable(containerRef, open, () => setOpen(false));

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={
          count > 0 ? `Notifications, ${count} recent` : "Notifications"
        }
        onClick={() => setOpen((value) => !value)}
        className="border-border text-foreground hover:bg-accent relative grid size-9 place-items-center rounded-full border transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        <Bell className="size-4" aria-hidden="true" />
        {count > 0 ? (
          <span
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-[var(--destructive)] px-1 text-[10px] leading-4 font-semibold text-white"
          >
            {count > 9 ? "9+" : count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Notifications"
          className="bg-card border-border absolute right-0 z-50 mt-2 w-80 origin-top-right rounded-2xl border p-2 shadow-lg"
        >
          <p className="text-muted-foreground px-3 py-2 text-xs tracking-wide uppercase">
            Notifications
          </p>

          {items.length === 0 ? (
            <p className="text-muted-foreground px-3 py-4 text-sm">
              Nothing new in the last week.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="hover:bg-accent flex items-start justify-between gap-3 rounded-xl px-3 py-2 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {notificationLabel(item.template)}
                    </p>
                    <p className="text-muted-foreground text-xs capitalize">
                      {item.channel}
                    </p>
                  </div>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {formatDateTime(item.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The My bookings shortcut.
 *
 * Hidden until the customer has at least one order, so a brand new account does
 * not see a link to an empty page. Goes straight to the list, where each order
 * links through to its tracking view.
 */
function BookingsIcon() {
  return (
    <Link
      href="/account/orders"
      aria-label="My bookings"
      title="My bookings"
      className="border-border text-foreground hover:bg-accent grid size-9 place-items-center rounded-full border transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      <Package className="size-4" aria-hidden="true" />
    </Link>
  );
}

/**
 * Closes a dropdown on Escape or a click outside it.
 *
 * Shared by the notification bell and the profile menu so both behave the same
 * way, which is also what a keyboard user would expect from two menus sitting
 * next to each other.
 */
function useDismissable(
  ref: React.RefObject<HTMLElement | null>,
  active: boolean,
  onDismiss: () => void,
) {
  useEffect(() => {
    if (!active) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onDismiss();
    }

    function onPointerDown(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) onDismiss();
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [active, onDismiss, ref]);
}

function initialsOf(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return "?";
  const last = parts.length > 1 ? parts[parts.length - 1] : undefined;
  if (!last) return first.slice(0, 2).toUpperCase();
  return `${first[0]}${last[0]}`.toUpperCase();
}

/**
 * The profile icon and its dropdown.
 *
 * Both entries are plain links to real pages: /account/profile for the
 * customer's details and /account/orders for their bookings. Nothing expands in
 * place, so the menu holds no state beyond whether it is open.
 */
function UserMenu({ user }: { user: NavbarUser }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useDismissable(containerRef, open, () => setOpen(false));

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
          className="bg-card border-border absolute right-0 z-50 mt-2 w-56 origin-top-right rounded-2xl border p-2 shadow-lg"
        >
          <MenuLink
            href="/account/profile"
            icon={<UserRound className="size-4" aria-hidden="true" />}
            onNavigate={() => setOpen(false)}
          >
            Profile details
          </MenuLink>

          {user.hasBookings ? (
            <MenuLink
              href="/account/orders"
              icon={<Package className="size-4" aria-hidden="true" />}
              onNavigate={() => setOpen(false)}
            >
              My bookings
            </MenuLink>
          ) : null}

          <div className="border-border mt-2 border-t pt-2">
            <SignOutLink className="[&_button]:w-full" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MenuLink({
  href,
  icon,
  children,
  onNavigate,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onNavigate}
      className="hover:bg-accent flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors"
    >
      {icon}
      {children}
    </Link>
  );
}
