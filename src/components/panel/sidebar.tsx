"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";

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
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href={home} onClick={closeMobile}>
                <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                  <Sparkles className="size-4" />
                </div>
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

      <SidebarContent>
        {visible.map((section) => (
          <SidebarGroup key={section.title}>
            <SidebarGroupLabel>{section.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => {
                  const Icon = panelIcon(item.href);
                  const active = item.href === activeHref;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.label}
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
