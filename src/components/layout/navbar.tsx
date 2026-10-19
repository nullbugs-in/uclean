"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Package, UserRound, Menu, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";

import { markAllNotificationsReadAction } from "@/app/(public)/notifications/actions";
import { notificationLabel } from "@/db/queries/notifications";
import { SignOutLink } from "@/components/layout/sign-out-link";
import { Button } from "@/components/ui/button";
import { NAV_LINKS } from "@/config/nav";
import { siteConfig } from "@/config/site";
import { formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

/** Soft lime glow cast by the primary CTAs. */
const CTA_GLOW = "shadow-[0_8px_24px_-8px_var(--primary)]";

export type NavbarUser = {
  fullName: string;
  mobile: string;
  role: string;
  /**
   * True once the customer has placed at least one order.
   *
   * No longer read by this component, which now links to My bookings
   * unconditionally. Kept because (public)/layout.tsx already computes it and
   * it is the natural signal for a future "new" badge.
   */
  hasBookings: boolean;
  /** Recent messages, for the notification bell. */
  notifications: {
    /**
     * Messages not yet marked read. This is the badge, and it survives a
     * refresh because it is counted from `notifications.read_at` rather than
     * held in component state.
     */
    unread: number;
    /**
     * The messages themselves, read or not. The bell is the only place a
     * customer can look back at what they were told, so marking read does not
     * remove anything from here.
     */
    items: Array<{
      id: number;
      template: string;
      channel: string;
      read_at: string | null;
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
        The account icon cluster is in the row at every width; only the centred
        text nav is desktop-only, moving into the panel below `lg`. The logo
        steps down a size below `sm` to keep logo + four icons + hamburger
        inside 320px.
      */}
      {/*
        One `minmax(0,1fr) auto minmax(0,1fr)` grid serves every breakpoint,
        which is what centres the logo. The equal side columns mean the middle
        column sits on the viewport's centre line rather than the centre of the
        gap between two unequal clusters, so a wide control on the right cannot
        drag the logo off-centre.

        The `minmax(0,...)` is load-bearing. A bare `1fr` is `minmax(auto,1fr)`,
        and that `auto` minimum means a track cannot shrink below its content -
        so an unequal left and right column would resolve to unequal tracks and
        push the logo sideways. Measured, that put the logo 32px off-centre at
        320px. Zeroing the minimum forces the columns equal at every width.

        The children are ordered hamburger, logo, nav, cluster. Below `lg` the
        hamburger is visible and the nav is hidden, giving
        [hamburger][logo][icons]. At `lg` the hamburger drops out and the logo
        slides into column 1, giving [logo][nav][icons] - the same markup, no
        duplicated row and no JS media query.
      */}
      <div className="relative mx-auto grid h-16 w-full max-w-6xl grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-4 sm:gap-3 sm:px-6">
        <button
          type="button"
          className="border-border text-foreground hover:bg-accent grid size-9 shrink-0 place-items-center justify-self-start rounded-full border transition-colors sm:size-10 lg:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>

        <Link
          href="/#hero"
          className="group flex items-center justify-self-center rounded-md lg:justify-self-start"
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
            className="h-8 w-auto transition-transform duration-200 group-hover:scale-[1.03] sm:h-10 lg:h-12"
          />
        </Link>

        <nav
          aria-label="Primary"
          className="bg-secondary/60 hidden items-center gap-1 justify-self-center rounded-full p-1 lg:flex"
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

        {/*
          Right-hand icons.

          Below `lg` this is notifications plus My bookings; sign out and the
          profile avatar are in the panel instead, so they are hidden here and
          that pair is hidden at `lg` in turn. Exactly one copy of each is ever
          focusable, because the other is display:none.
        */}
        <div className="flex items-center gap-1 justify-self-end sm:gap-2">
          <AuthControls user={user} />
        </div>
      </div>

      {/*
        The mobile panel is an overlay, not flow content: `absolute top-full`
        anchors it to the bottom edge of the sticky header so it floats over the
        hero instead of growing the header and pushing the page down. The
        header (sticky, so already a positioning context) casts the same shadow
        so the panel reads as part of it.
      */}
      <div
        id="mobile-menu"
        hidden={!open}
        className="border-border bg-background absolute inset-x-0 top-full border-t shadow-[0_8px_24px_-16px_rgba(0,0,0,0.25)] lg:hidden"
      >
        <nav
          aria-label="Mobile"
          className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-4 sm:px-6"
        >
          {NAV_LINKS.map((link) => {
            const active = isActive(link.href);
            const Icon = link.icon;

            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex h-12 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/15 text-foreground"
                    : "text-foreground hover:bg-accent",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-lg transition-colors",
                    active
                      ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  <Icon className="size-4" />
                </span>
                {link.label}
              </Link>
            );
          })}

          {user ? (
            <div className="border-border mt-3 flex items-center gap-2 border-t pt-3">
              {/*
                Left-aligned to line up with the nav links above the divider.
                The profile avatar has moved up into the header row, so My
                bookings takes the slot it vacated; sign out stays put.
              */}
              <BookingsIcon className="size-10" />
              <SignOutLink variant="icon" className="size-10" />
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              <Button asChild className={cn("h-11 w-full", CTA_GLOW)}>
                <Link href="/auth/signup" onClick={() => setOpen(false)}>
                  Sign up
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-11 w-full">
                <Link href="/auth/login" onClick={() => setOpen(false)}>
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
 * Log in / Sign up while signed out; once signed in, the My bookings shortcut,
 * notifications, the profile menu, and sign out.
 *
 * The session is resolved by (public)/layout.tsx and passed in, because the
 * navbar is a client component and cannot read cookies itself.
 */
function AuthControls({ user }: { user: NavbarUser | null }) {
  if (!user) {
    return (
      <>
        {/*
          Two labelled buttons measure ~164px together, which does not fit a
          side column of a centre-locked grid below about 430px. So below `md`
          the row shows the single primary CTA and Log in drops to the panel,
          which already offers both at full width. Nothing is unreachable.
        */}
        <Button
          asChild
          variant="outline"
          size="sm"
          className="hidden md:inline-flex"
        >
          {/*
            No `?redirect=` here. A present param overrides the page's own
            default, so hardcoding "/" pinned every sign-in to the bare home
            route and quietly defeated the `/#hero` destination. Leaving it off
            lets the login page decide where a successful sign-in goes.
          */}
          <Link href="/auth/login">Log in</Link>
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
      {/*
        Desktop keeps its four-icon order: sign out, bookings, notifications,
        profile. Below `lg` the row shows only the bell and the profile avatar -
        My bookings and sign out live in the panel instead - so the phone row
        stays to two icons and leaves the centred logo room.

        The `hidden lg:block` wrappers are what keep exactly one copy of each
        control focusable at any width.
      */}
      <div className="hidden lg:block">
        <SignOutLink variant="icon" />
      </div>
      <div className="hidden lg:block">
        <BookingsIcon />
      </div>
      <NotificationsBell notifications={user.notifications} />
      <div className="lg:hidden">
        <ProfileAvatarLink user={user} />
      </div>
      <div className="hidden lg:block">
        <UserMenu user={user} />
      </div>
    </>
  );
}

/**
 * The profile avatar as a plain link, for the phone row.
 *
 * A link rather than the `UserMenu` dropdown: that menu is `absolute right-0`
 * against its own container, which in the row would hang off the avatar fine,
 * but the panel version is a link too and one control doing both jobs keeps the
 * two breakpoints behaving identically.
 */
function ProfileAvatarLink({ user }: { user: NavbarUser }) {
  return (
    <Link
      href="/account/profile"
      aria-label={`Profile details for ${user.fullName}`}
      className="ring-primary/40 bg-primary/20 grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold transition-shadow hover:ring-2 focus-visible:ring-2 focus-visible:outline-none"
    >
      <span aria-hidden="true">{initialsOf(user.fullName)}</span>
    </Link>
  );
}

/**
 * The notification bell.
 *
 * "Read all" writes `notifications.read_at` through
 * `mark_all_notifications_read()` (migration 13), so the cleared badge survives a
 * refresh and follows the customer to another device. Only messages that arrive
 * afterwards count again.
 *
 * The local `seen` state is the optimistic half: it clears the badge the moment
 * the button is pressed rather than after a round trip, and it re-seeds from the
 * prop whenever the server sends a different count, so a navigation that re-runs
 * the layout corrects anything the optimistic update got wrong.
 *
 * Marking read does not remove anything from the list. The bell is the only
 * place a customer can look back at what they were told, and emptying it behind
 * the very button that marked them read would make anything scrolled past
 * unreachable. Messages already read are dimmed instead.
 */
export function NotificationsBell({
  notifications,
}: {
  notifications: NavbarUser["notifications"];
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { unread, items } = notifications;
  const [seen, setSeen] = useState(unread);
  const [seenCount, setSeenCount] = useState(unread);
  const [isPending, startTransition] = useTransition();

  /*
   * React's documented way to derive state from a prop: compare against the
   * *previous prop* during render, not in an effect.
   *
   * The distinction is the whole trick. Comparing `unread` against `seen` would
   * re-fire the moment `setSeen(0)` below runs - the badge would put its own old
   * number straight back, because the server has not answered yet. Comparing
   * against `seenCount` means the sync only fires when the server actually
   * sends something different, which is what carries a newly arrived message
   * into the badge and what corrects the optimistic update if it was wrong.
   */
  if (unread !== seenCount) {
    setSeenCount(unread);
    setSeen(unread);
  }

  useDismissable(containerRef, open, () => setOpen(false));

  function markAllRead() {
    // Clear first so the badge responds immediately; the action persists it.
    setSeen(0);

    startTransition(async () => {
      await markAllNotificationsReadAction();
    });
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={
          seen > 0 ? `Notifications, ${seen} recent` : "Notifications"
        }
        onClick={() => setOpen((value) => !value)}
        className="border-border text-foreground hover:bg-accent relative grid size-9 place-items-center rounded-full border transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        <Bell className="size-4" aria-hidden="true" />
        {seen > 0 ? (
          <span
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-[var(--destructive)] px-1 text-[10px] leading-4 font-semibold text-white"
          >
            {seen > 9 ? "9+" : seen}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Notifications"
          className="bg-card border-border absolute right-0 z-50 mt-2 w-80 origin-top-right rounded-2xl border p-2 shadow-lg"
        >
          {/*
            Header and "Read all" on one line. The button is only rendered when
            there is something unread to clear - a permanently present control
            that does nothing is worse than no control.
          */}
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <p className="text-muted-foreground text-xs tracking-wide uppercase">
              Notifications
            </p>

            {seen > 0 ? (
              <button
                type="button"
                onClick={markAllRead}
                disabled={isPending}
                className="text-muted-foreground hover:text-foreground hover:bg-accent rounded-md px-1.5 py-0.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60"
              >
                {isPending ? "Marking..." : "Read all"}
              </button>
            ) : null}
          </div>

          {items.length === 0 ? (
            <p className="text-muted-foreground px-3 py-4 text-sm">
              Nothing new in the last week.
            </p>
          ) : (
            /*
              Capped to about four rows and scrolled from there: enough to show
              what kind of messages these are, without the dropdown becoming the
              height of the screen on a phone.

              The rows hold no focusable controls, so the region is itself
              focusable and labelled - without that the box would be reachable by
              pointer only.
            */
            <ul
              role="region"
              aria-label={`Notifications, ${items.length} in the last week`}
              tabIndex={0}
              className="focus-visible:outline-ring max-h-56 [scrollbar-width:thin] space-y-0.5 overflow-y-auto overscroll-contain focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
            >
              {items.map((item) => (
                <li
                  key={item.id}
                  className="hover:bg-accent flex items-start justify-between gap-3 rounded-xl px-3 py-2 transition-colors"
                >
                  <div className="min-w-0">
                    <p
                      className={cn(
                        "truncate text-sm font-medium",
                        // Read messages stay readable but stop competing with
                        // the unread ones for attention.
                        item.read_at && "text-muted-foreground font-normal",
                      )}
                    >
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
 * Always shown, including for an account with no orders yet. /account/orders
 * already renders a "No bookings yet" state with a Book a pickup call to
 * action, so an empty list is something worth navigating to rather than a dead
 * end - and the customer who has just signed up can see where their bookings
 * will appear.
 *
 * `className` exists so the panel can render it at the 40px touch size used by
 * the other panel controls; `cn` resolves the clash against the `size-9`
 * default rather than emitting both.
 */
function BookingsIcon({ className }: { className?: string }) {
  return (
    <Link
      href="/account/orders"
      aria-label="My bookings"
      title="My bookings"
      className={cn(
        "border-border text-foreground hover:bg-accent grid size-9 place-items-center rounded-full border transition-colors focus-visible:ring-2 focus-visible:outline-none",
        className,
      )}
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
 * place, so the menu holds no state beyond whether it is open. The menu sizes
 * to its own content, floored at a width that keeps the labels comfortable.
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
          className="bg-card border-border absolute right-0 z-50 mt-2 w-fit min-w-44 origin-top-right rounded-2xl border p-2 shadow-lg"
        >
          <MenuLink
            href="/account/profile"
            icon={<UserRound className="size-4" aria-hidden="true" />}
            onNavigate={() => setOpen(false)}
          >
            Profile
          </MenuLink>

          <MenuLink
            href="/account/orders"
            icon={<Package className="size-4" aria-hidden="true" />}
            onNavigate={() => setOpen(false)}
          >
            My bookings
          </MenuLink>

          {/*
            The icon variant, matching the round sign-out control in the navbar
            row rather than a full-width lime button. At full width it read as
            the loudest thing in a menu of two quiet links, and it stretched the
            menu to fit a label the dropdown no longer needs. The button still
            carries an aria-label and title, so it stays announced on hover and
            to screen readers.
          */}
          <div className="border-border mt-2 flex justify-end border-t pt-2">
            <SignOutLink variant="icon" />
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
