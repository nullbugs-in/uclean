"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

import UcleanIcon from "@/app/icon.png";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import type { Profile } from "@/db/types";

import { panelIcon } from "./icons";
import { PanelUserMenu } from "./user-menu";

export type PanelNavItem = {
  href: string;
  label: string;
  /** Only render for one of these roles. Omit to show to everyone in the panel. */
  roles?: ReadonlyArray<Profile["role"]>;
};

export type PanelNavSection = {
  title: string;
  items: PanelNavItem[];
};

export type PanelUser = {
  full_name: string;
  role: Profile["role"];
};

/** First path segment of a href, e.g. "/staff/orders" -> "/staff". */
function panelRoot(href: string | undefined) {
  const segment = href?.split("/").filter(Boolean)[0];
  return segment ? `/${segment}` : "/";
}

/**
 * Collapsible panel sidebar.
 *
 * Client-side, but only for pathname and collapse state: the session user is
 * resolved on the server and arrives as a prop, so nothing about auth happens
 * here.
 *
 * Active highlighting picks the single longest href that prefixes the current
 * path. A plain prefix test would light up both "/staff" and "/staff/pickups"
 * while the pickups page is open, which is the kind of thing that makes a nav
 * feel broken.
 */
export function PanelSidebar({
  sections,
  user,
  panelName,
}: {
  sections: PanelNavSection[];
  user: PanelUser;
  panelName: string;
}) {
  const pathname = usePathname() ?? "";
  // The mobile sidebar is a Sheet, and nothing in the underlying `Link`s
  // dismissed it: clicking a module navigated while the drawer stayed open.
  // Selection itself now closes it — a silent no-op on desktop, where only
  // openMobile drives the Sheet.
  const { setOpenMobile } = useSidebar();

  const closeMobile = () => setOpenMobile(false);

  const visible = sections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => !item.roles || item.roles.includes(user.role),
      ),
    }))
    .filter((section) => section.items.length > 0);

  const activeHref = visible
    .flatMap((section) => section.items)
    .reduce<string | undefined>((best, item) => {
      const matches =
        pathname === item.href || pathname.startsWith(`${item.href}/`);
      if (!matches) return best;
      return best === undefined || item.href.length > best.length
        ? item.href
        : best;
    }, undefined);

  const home = panelRoot(visible[0]?.items[0]?.href);

  return (
    <Sidebar collapsible="icon">
      {/* pb-0 + gap-0 + a shallow first group: the default spacing stacks
          16px under the module name and 24px between sections, which made
          the sidebar read as a floating list. The titles now sit ~4px under
          the wordmark and 16px apart. */}
      <SidebarHeader className="pb-0">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="pb-0" asChild>
              <Link href={home} onClick={closeMobile}>
                {/*
                  The favicon is the brand mark itself — a rounded green "U"
                  tile — so it replaces the whole logo tile rather than
                  sitting inside one. alt="" because the wordmark beside it
                  already reads UClean.
                */}
                <Image
                  src={UcleanIcon}
                  alt=""
                  className="size-8 shrink-0 rounded-lg"
                  aria-hidden
                />
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">UClean</span>
                  <span className="truncate text-xs opacity-80">
                    {panelName}
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="gap-0">
        {visible.map((section, sectionIndex) => (
          <SidebarGroup
            key={section.title}
            // Nav rows pay for the title space: py-1.5 (32px rows, was 36px)
            // funds each section's wider pt-5, so the list is ~20px SHORTER
            // than the last round and the scrollbar stays away even on short
            // tablet/landscape viewports.
            className={sectionIndex === 0 ? "pt-0 pb-0" : "pt-5 pb-0"}
          >
            {/* h-7 per section row keeps the title rhythm; the first stays
                h-5 flush under the wordmark. text-primary paints the
                section titles in the brand's lime green. */}
            <SidebarGroupLabel
              className={`${sectionIndex === 0 ? "h-5" : "h-7"} text-primary`}
            >
              {section.title}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0">
                {section.items.map((item) => {
                  const Icon = panelIcon(item.href);
                  const active = item.href === activeHref;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.label}
                        className="py-1.5"
                      >
                        <Link
                          href={item.href}
                          onClick={closeMobile}
                          aria-current={active ? "page" : undefined}
                        >
                          {Icon ? <Icon /> : null}
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <PanelUserMenu user={user} panelName={panelName} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
