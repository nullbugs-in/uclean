import type { ReactNode } from "react";

/**
 * Page container shared by every panel screen.
 *
 * A page owns its own padding but not its width: `PanelShell` already caps the
 * content column, so every screen lines up no matter which nav item opened it.
 * The staff panel used to re-declare a narrower width of its own, which made
 * its pages visibly ragged against the admin panel's - hence one component
 * rather than one per panel.
 *
 * Deliberately not the same thing as `PagePlaceholder`, which still marks the
 * routes that have a layout and a data contract but no feature yet. A screen
 * that is finished should not advertise itself as a stub.
 */
export function PanelPage({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="w-full space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>
        {action}
      </header>

      {children}
    </div>
  );
}
