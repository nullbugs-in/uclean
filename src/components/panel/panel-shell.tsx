import type { Profile } from "@/db/types";

import { SignOutButton } from "@/components/layout/sign-out-button";

import { PanelSidebar, type PanelNavSection } from "./sidebar";

export type { PanelNavSection, PanelNavItem } from "./sidebar";

/**
 * Shared chrome for the three authenticated panels.
 *
 * A server component: the session user is resolved before it renders, so no
 * panel layout ever paints without a known role. Only the sidebar is a client
 * component, and only because it needs the current path.
 */
export function PanelShell({
  panelName,
  sections,
  user,
  children,
}: {
  panelName: string;
  sections: PanelNavSection[];
  user: { full_name: string; role: Profile["role"] };
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col md:flex-row">
      <div className="shrink-0">
        <p className="px-4 pt-4 text-xs font-semibold tracking-wider text-[var(--muted-foreground)] uppercase md:hidden">
          {panelName}
        </p>
        <PanelSidebar sections={sections} role={user.role} />
      </div>
      <main className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-[var(--muted-foreground)]">
              Signed in as{" "}
              <span className="text-foreground font-medium">
                {user.full_name}
              </span>
            </p>
            <span className="text-xs text-[var(--muted-foreground)]">
              {user.role}
            </span>
          </div>
          <SignOutButton />
        </div>
        {children}
      </main>
    </div>
  );
}
