import type { ReactNode } from "react";

/**
 * Page container for the staff panel.
 *
 * Mirrors the shared PagePlaceholder header without its "scaffolded" footer: a
 * shipped staff screen should not advertise itself as a stub anymore. It lives
 * inside the (staff) route group so the staff module owns its own chrome rather
 * than editing the component every other panel shares.
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
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="text-[var(--muted-foreground)]">{description}</p>
        </div>
        {action}
      </header>

      {children}
    </div>
  );
}
