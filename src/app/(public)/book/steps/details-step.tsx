"use client";

import { Loader2, ShieldCheck } from "lucide-react";
import * as React from "react";

import { requestLoginOtpAction } from "@/app/(auth)/auth/actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { signUpSchema } from "@/lib/validation";

import { normalizeMobile } from "../format";

type DetailsStepProps = {
  defaultName: string;
  defaultMobile: string;
  /** Non-null only in development, where the fixed code is shown as a hint. */
  devTestCode: string | null;
  onVerified: (identity: { name: string; mobile: string }) => void;
};

/**
 * Step 1: name and mobile, then a one-time code.
 *
 * Verification is what creates the Supabase session the rest of the wizard
 * depends on, so this step is the gate: nothing after it renders until it
 * succeeds.
 */
export function DetailsStep({
  defaultName,
  defaultMobile,
  devTestCode,
  onVerified,
}: DetailsStepProps) {
  const [stage, setStage] = React.useState<"form" | "code">("form");
  const [name, setName] = React.useState(defaultName);
  const [mobile, setMobile] = React.useState(defaultMobile);
  const [token, setToken] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();
  const [cooldown, setCooldown] = React.useState(0);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(
      () => setCooldown((value) => value - 1),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  function requestCode(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setErrors({});
    setFormError(null);

    const parsed = signUpSchema.safeParse({ fullName: name, mobile });

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? "form");
        if (!fieldErrors[field]) fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    const normalized = normalizeMobile(parsed.data.mobile);

    startTransition(async () => {
      const result = await requestLoginOtpAction({
        mobile: normalized,
        fullName: parsed.data.fullName,
      });

      if (result.ok) {
        setMobile(normalized);
        setStage("code");
        setCooldown(30);
        return;
      }

      setFormError(result.message);
      if (result.fieldErrors) setErrors(result.fieldErrors);
    });
  }

  function verifyCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!/^\d{4,8}$/.test(token.trim())) {
      setFormError("Enter the code we sent to your mobile number.");
      return;
    }

    startTransition(async () => {
      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile, token: token.trim(), fullName: name }),
      });

      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        setFormError(body?.error ?? "That code is not valid or has expired.");
        return;
      }

      onVerified({ name, mobile });
    });
  }

  if (stage === "code") {
    return (
      <div className="space-y-5">
        <p className="text-muted-foreground text-sm">
          We sent a 6 digit code to{" "}
          <span className="text-foreground font-medium">{mobile}</span>.
        </p>

        {devTestCode ? (
          <p className="border-primary/40 bg-primary/10 rounded-lg border px-3 py-2 text-xs">
            <span className="font-semibold">Dev mode:</span> no SMS is sent. Use
            code{" "}
            <button
              type="button"
              className="font-mono font-semibold underline"
              onClick={() => setToken(devTestCode)}
            >
              {devTestCode}
            </button>
            .
          </p>
        ) : null}

        <form className="space-y-4" onSubmit={verifyCode} noValidate>
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
            />
          </div>

          {formError ? (
            <p role="alert" className="text-sm text-[var(--destructive)]">
              {formError}
            </p>
          ) : null}

          <Button className="w-full" type="submit" disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" />
                Verifying...
              </>
            ) : (
              "Verify and continue"
            )}
          </Button>
        </form>

        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
            onClick={() => {
              setStage("form");
              setToken("");
              setFormError(null);
            }}
          >
            Change number
          </button>
          <button
            type="button"
            className="font-medium text-[var(--primary)] underline-offset-4 hover:underline disabled:opacity-50"
            disabled={cooldown > 0 || isPending}
            onClick={() => requestCode()}
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="space-y-5" onSubmit={requestCode} noValidate>
      <div className="space-y-2">
        <Label htmlFor="fullName">Your name</Label>
        <Input
          id="fullName"
          name="fullName"
          autoComplete="name"
          placeholder=""
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={Boolean(errors.fullName)}
          aria-describedby={errors.fullName ? "fullName-error" : undefined}
        />
        {errors.fullName ? (
          <p
            id="fullName-error"
            role="alert"
            className="text-sm text-[var(--destructive)]"
          >
            {errors.fullName}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="mobile">Mobile number</Label>
        <Input
          id="mobile"
          name="mobile"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder=""
          value={mobile}
          onChange={(event) => setMobile(event.target.value)}
          aria-invalid={Boolean(errors.mobile)}
          aria-describedby={errors.mobile ? "mobile-error" : undefined}
        />
        {errors.mobile ? (
          <p
            id="mobile-error"
            role="alert"
            className="text-sm text-[var(--destructive)]"
          >
            {errors.mobile}
          </p>
        ) : null}
      </div>

      {formError ? (
        <p role="alert" className="text-sm text-[var(--destructive)]">
          {formError}
        </p>
      ) : null}

      <Button className="w-full" type="submit" disabled={isPending}>
        {isPending ? (
          <>
            <Loader2 className="animate-spin" aria-hidden="true" />
            Sending code...
          </>
        ) : (
          "Send OTP"
        )}
      </Button>

      <p className="text-muted-foreground flex items-center justify-center gap-2 text-xs">
        <ShieldCheck className="size-4" aria-hidden="true" />
        We only use your number to confirm your booking.
      </p>
    </form>
  );
}
