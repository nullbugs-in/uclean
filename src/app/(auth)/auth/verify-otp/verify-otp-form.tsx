"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { verifyOtpSchema } from "@/lib/validation/auth";

export function VerifyOtpForm({
  mobile,
  redirectTo,
}: {
  mobile: string;
  redirectTo: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const data = new FormData(event.currentTarget);
    const parsed = verifyOtpSchema.safeParse({
      mobile,
      token: data.get("token"),
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter the 6 digit code");
      return;
    }

    startTransition(async () => {
      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? "That code is not valid or has expired.");
        return;
      }

      // Hard navigation so the middleware re-reads the freshly set session
      // cookie before the destination renders.
      router.replace(redirectTo);
      router.refresh();
    });
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit} noValidate>
      <div className="space-y-2">
        <Label htmlFor="token">6 digit code</Label>
        <Input
          id="token"
          name="token"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="123456"
          className="text-center text-lg tracking-[0.4em]"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "token-error" : undefined}
        />
        {error ? (
          <p
            id="token-error"
            role="alert"
            className="text-sm text-[var(--destructive)]"
          >
            {error}
          </p>
        ) : null}
      </div>

      <Button className="w-full" disabled={isPending} type="submit">
        {isPending ? "Verifying..." : "Verify and continue"}
      </Button>
    </form>
  );
}
