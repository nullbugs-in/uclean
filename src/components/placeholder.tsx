import type { ReactNode } from "react";

/**
 * Stub page marker used by every route that has a layout and a data contract
 * but no built feature yet.
 *
 * Keeping these consistent makes it obvious at a glance which parts of the
 * architecture doc are scaffolded and which are actually implemented, and
 * gives a reviewer a single place to check the next milestone.
 */
export function PagePlaceholder({
  title,
  description,
  milestone,
  children,
}: {
  title: string;
  description: string;
  milestone?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-[var(--muted-foreground)]">{description}</p>
      </header>

      {children}

      <p className="rounded-md border border-dashed border-[var(--border)] px-4 py-3 text-sm text-[var(--muted-foreground)]">
        Scaffolded, not yet implemented.
        {milestone ? ` Scheduled for ${milestone}.` : null}
      </p>
    </div>
  );
}
