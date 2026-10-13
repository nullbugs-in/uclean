"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Error monitoring is a Milestone 8 item. Until Sentry is wired up, log to
    // the server console so a production failure is still visible.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-3xl font-bold tracking-tight">
        Something went wrong
      </h1>
      <p className="text-[var(--muted-foreground)]">
        We hit an unexpected problem. Your order data is safe.
      </p>
      {error.digest ? (
        <p className="text-xs text-[var(--muted-foreground)]">
          Reference: {error.digest}
        </p>
      ) : null}
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
