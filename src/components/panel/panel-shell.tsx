import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

import { PanelProviders } from "./panel-providers";
import { PanelTopbar } from "./panel-topbar";
import { PanelSidebar, type PanelNavSection, type PanelUser } from "./sidebar";

export type { PanelNavSection, PanelNavItem } from "./sidebar";

/**
 * Shared chrome for the three authenticated panels.
 *
 * A server component: the session user is resolved before it renders, so no
 * panel layout ever paints without a known role. The interactive pieces
 * (sidebar, topbar, theme, command palette) are client components nested
 * inside, which keeps the auth decision on the server where it belongs.
 *
 * The props are deliberately unchanged from the hand-rolled shell this
 * replaces. The customer account panel lives in a route group this branch does
 * not own, and keeping the contract identical means it picks up the new chrome
 * without anyone having to touch that file.
 */
export function PanelShell({
  panelName,
  sections,
  user,
  children,
}: {
  panelName: string;
  sections: PanelNavSection[];
  user: PanelUser;
  children: React.ReactNode;
}) {
  return (
    <PanelProviders>
      <SidebarProvider>
        <PanelSidebar
          sections={sections}
          user={user}
          panelName={panelName}
        />
        <SidebarInset>
          <PanelTopbar
            panelName={panelName}
            sections={sections}
            role={user.role}
          />
          <main className="min-w-0 flex-1">
            {/* One shared width cap so every page lines up; padding stays with
                the page, since an embedded table and a summary card want
                different amounts of it. */}
            <div className="mx-auto w-full max-w-7xl">{children}</div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </PanelProviders>
  );
}
