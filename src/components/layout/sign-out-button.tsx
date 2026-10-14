"use client";

import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { signOutAction } from "@/server/sign-out";

export function SignOutButton() {
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
        variant="outline"
        size="sm"
        disabled={isPending}
      >
        {isPending ? "Signing out..." : "Sign out"}
      </Button>
    </form>
  );
}
