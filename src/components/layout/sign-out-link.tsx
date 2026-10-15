"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { signOutAction } from "@/server/sign-out";
import { cn } from "@/lib/utils";

/**
 * The navbar's sign-out control, in the brand lime.
 *
 * Deliberately separate from `sign-out-button.tsx`, which the staff and admin
 * panels render through PanelShell. Recolouring that one would change their
 * sign-out button too, so the navbar gets its own control that calls the same
 * `signOutAction` server action.
 */
export function SignOutLink({ className }: { className?: string }) {
  const [isPending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      await signOutAction();
    });
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
