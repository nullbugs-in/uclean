"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import type { Profile } from "@/db/types";

import { PanelCommandMenu } from "./panel-command-menu";
import type { PanelNavSection } from "./sidebar";
import { ThemeToggle } from "./theme-toggle";

/** Route ids and slugs are not worth reading, so they collapse to one word. */
function humanise(segment: string) {
  if (/^\d+$/.test(segment) || /^[0-9a-f-]{8,}$/i.test(segment)) {
    return "Details";
  }
  return segment.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Sticky panel header.
 *
 * Client-side because the trail is derived from the pathname. Labels come from
 * the same nav sections the sidebar renders, so a page is never named one thing
 * in the sidebar and another in the breadcrumb.
 */
export function PanelTopbar({
  panelName,
  sections,
  role,
}: {
  panelName: string;
  sections: PanelNavSection[];
  role: Profile["role"];
}) {
  const pathname = usePathname() ?? "";

  const labels = new Map(
    sections.flatMap((section) => section.items).map((i) => [i.href, i.label]),
  );

  const segments = pathname.split("/").filter(Boolean);
  const home = segments[0] ? `/${segments[0]}` : "/";

  const trail = segments.slice(1).map((segment, index) => {
    // +1 because slice(1) drops the panel prefix.
    const href = "/" + segments.slice(0, index + 2).join("/");
    return { href, label: labels.get(href) ?? humanise(segment) };
  });

  return (
    <header className="bg-background/80 sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur-sm">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 h-4!" />

      <Breadcrumb className="min-w-0">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={home}>{panelName}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>

          {trail.map((crumb, index) => {
            const isLast = index === trail.length - 1;
            return (
              <span key={crumb.href} className="contents">
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  {isLast ? (
                    <BreadcrumbPage className="truncate">
                      {crumb.label}
                    </BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Link href={crumb.href}>{crumb.label}</Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </span>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>

      <div className="ml-auto flex items-center gap-2">
        <PanelCommandMenu
          sections={sections}
          role={role}
          panelName={panelName}
        />
        <ThemeToggle />
      </div>
    </header>
  );
}
