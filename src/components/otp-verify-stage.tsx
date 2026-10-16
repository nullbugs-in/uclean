"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { DevOtpHint } from "@/components/dev-otp-hint";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { verifyOtpSchema } from "@/lib/validation/auth";

/**
 * The "enter your code" half of an OTP flow.
 *
 * Shared by the login form, the sign-up form and the standalone verify page so
 * there is one implementation of the verify call. The booking wizard has its own
 * equivalent inside `DetailsStep`, which additionally owns a resend cooldown.
 *
 * `intent` is what keeps signup and login from being the same flow again. It is
 * sent to the server, which re-checks it: login is refused for a number with no
 * account, and signup is refused for a number that has one. The component itself
 * does not branch on it, because the server is the only party that can be
 * trusted to know which case this is.
 *
 * `fullName` matters in development only: with the dev code active nothing is
 * created at request time, so the account is built at verify time here. Without
 * the name the profile trigger has nothing to name it with.
 */
export function OtpVerifyStage({
  mobile,
  fullName,
  intent = "login",
  redirectTo,
  devTestCode,
  onChangeNumber,
  onResend,
  onUnregistered,
}: {
  mobile: string;
  fullName?: string;
  intent?: "signup" | "login" | "auto";
  redirectTo: string;
  devTestCode?: string | null;
  /** Returns the flow to the mobile-number stage. */
  onChangeNumber?: () => void;
  /** Re-requests a code, when the caller has a cooldown or button for it. */
  onResend?: () => void;
  /** Called once the server reports this number has no account. */
  onUnregistered?: () => void;
}) {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsed = verifyOtpSchema.safeParse({ mobile, token, intent });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter the 6 digit code");
      return;
    }

    startTransition(async () => {
      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...parsed.data,
          ...(fullName ? { fullName } : {}),
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
          unregistered?: boolean;
        } | null;

        /*
         * The server only sets `unregistered` once the attempt limit is spent,
         * so reaching here means this number has been tried against enough
         * times that continuing to hide it helps nobody. Below the limit the
         * message is identical for a wrong code and an unknown number.
         */
        if (body?.unregistered && onUnregistered) {
          onUnregistered();
        }

        setError(body?.error ?? "That code is not valid or has expired.");
        return;
      }

      /*
       * A real document load, not a soft route change.
       *
       * Two things a client-side `router.replace` cannot do here:
       *
       * 1. `router.replace` is a soft navigation, so the freshly set session
       *    cookie is never re-read by the proxy before the destination renders.
       * 2. A soft navigation to a URL with a hash does not reliably scroll to
       *    the anchor - the destination can render with the hero scrolled out
       *    of view, which is exactly what "land on the hero" means here.
       *
       * `location.assign` is a genuine page load: the proxy runs again, the
       * browser resolves the fragment itself, and `scroll-padding-top` in
       * globals.css keeps the hero clear of the sticky navbar.
       */
      window.location.assign(redirectTo);
    });
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit} noValidate>
      <p className="text-muted-foreground text-sm">
        We sent a 6 digit code to{" "}
        <span className="text-foreground font-medium">{mobile}</span>.
      </p>

      {devTestCode ? (
        <DevOtpHint code={devTestCode} onUse={() => setToken(devTestCode)} />
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="token">6 digit code</Label>
        <Input
          id="token"
          name="token"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="123456"
          value={token}
          onChange={(event) => setToken(event.target.value)}
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
        {isPending ? (
          <>
            <Loader2 className="animate-spin" aria-hidden="true" />
            Verifying...
          </>
        ) : (
          "Verify and continue"
        )}
      </Button>

      {onChangeNumber || onResend ? (
        <div className="flex items-center justify-between text-sm">
          {onChangeNumber ? (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
              onClick={onChangeNumber}
            >
              Change number
            </button>
          ) : (
            <span />
          )}
          {onResend ? (
            <button
              type="button"
              className="font-medium text-[var(--primary)] underline-offset-4 hover:underline disabled:opacity-50"
              disabled={isPending}
              onClick={onResend}
            >
              Resend code
            </button>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
