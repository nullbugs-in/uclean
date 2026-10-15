import type { ReactNode } from "react";

/**
 * Page container for the staff panel.
 *
 * A page owns its own padding but not its width: `PanelShell` already caps the
 * content column at max-w-7xl, so every screen in the panel lines up no matter
 * which nav item opened it. This used to re-declare a narrower max-w-5xl of its
 * own, which made some staff pages visibly ragged against others.
 */
export function StaffPage({
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
