"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { signOutAction } from "@/server/sign-out";
import { cn } from "@/lib/utils";

/**
 * The navbar's sign-out control.
 *
 * Deliberately separate from `sign-out-button.tsx`, which the staff and admin
 * panels render through PanelShell. Recolouring that one would change their
 * sign-out button too, so the navbar gets its own control calling the same
 * `signOutAction`.
 *
 * `variant="icon"` is the round toolbar button used in the navbar row;
 * `variant="button"` keeps the labelled button for the profile dropdown and the
 * mobile menu, where an icon on its own would be ambiguous.
 */
export function SignOutLink({
  variant = "button",
  className,
}: {
  variant?: "icon" | "button";
  className?: string;
}) {
  const [isPending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      await signOutAction();
    });
  }

  if (variant === "icon") {
    return (
      <form onSubmit={onSubmit}>
        <button
          type="submit"
          disabled={isPending}
          aria-label="Sign out"
          title="Sign out"
          className={cn(
            "border-border text-foreground hover:bg-accent grid size-9 place-items-center rounded-full border transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60",
            className,
          )}
        >
          <LogOut className="size-4" aria-hidden="true" />
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <Button
        type="submit"
        size="sm"
        disabled={isPending}
        className={cn(
          "bg-primary text-primary-foreground shadow-[0_8px_24px_-8px_var(--primary)] transition-all hover:-translate-y-0.5 focus-visible:ring-[var(--ring)]/40 disabled:translate-y-0",
          className,
        )}
      >
        <LogOut aria-hidden="true" />
        {isPending ? "Signing out..." : "Sign out"}
      </Button>
    </form>
  );
}
