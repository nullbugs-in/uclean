"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { Profile } from "@/db/types";
import { cn } from "@/lib/utils";

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

/**
 * Client component because it needs usePathname to mark the active link, which
 * a server layout cannot read. The session user is still resolved on the
 * server and passed in as a prop, so nothing about auth happens here.
 */
export function PanelSidebar({
  sections,
  role,
}: {
  sections: PanelNavSection[];
  role: Profile["role"];
}) {
  const pathname = usePathname() ?? "";

  return (
    <nav
      aria-label="Panel"
      className="w-full shrink-0 space-y-6 border-b border-[var(--border)] p-4 md:w-56 md:border-r md:border-b-0"
    >
      {sections.map((section) => (
        <div key={section.title} className="space-y-1">
          <p className="px-2 pb-1 text-xs font-semibold tracking-wider text-[var(--muted-foreground)] uppercase">
            {section.title}
          </p>
          <ul className="space-y-0.5">
            {section.items
              .filter((item) => !item.roles || item.roles.includes(role))
              .map((item) => {
                const active =
                  pathname === item.href ||
                  pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "block rounded-md px-2 py-1.5 text-sm transition-colors",
                        active
                          ? "bg-[var(--accent)] font-medium text-[var(--accent-foreground)]"
                          : "text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]",
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
