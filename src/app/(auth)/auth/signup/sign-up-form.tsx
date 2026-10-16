"use client";

import { useState, useTransition } from "react";

import { OtpVerifyStage } from "@/components/otp-verify-stage";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { signUpSchema } from "@/lib/validation/auth";

import { requestSignupOtpAction } from "../actions";

/**
 * Signup is name and mobile, and it refuses a number that already has an account.
 *
 * It posts to its own action rather than the login one. That split is the fix:
 * both forms used to call `requestLoginOtpAction`, which always asked Supabase
 * for `shouldCreateUser: true`, so signing in with an unknown number quietly
 * created an account and "login" and "signup" were the same request.
 *
 * The number arrives here already canonical, so what is shown on the verify
 * screen is exactly what was stored.
 */
export function SignUpForm({
  redirectTo,
  devTestCode,
}: {
  redirectTo: string;
  /** Non-null only in development, where the fixed code is shown as a hint. */
  devTestCode: string | null;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  /** Set when the number already belongs to someone, so we can offer login. */
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  /**
   * Kept alongside the mobile number because nothing is created when a code is
   * requested in development: the profile is made at verify time, from this
   * value. Losing it here is what used to name the account "dev-919876543210".
   */
  const [sentName, setSentName] = useState("");
  const [isPending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setFormError(null);
    setAlreadyRegistered(false);

    const data = new FormData(event.currentTarget);
    const parsed = signUpSchema.safeParse({
      fullName: data.get("fullName"),
      mobile: data.get("mobile"),
    });

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        fieldErrors[key] ??= issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    startTransition(async () => {
      const result = await requestSignupOtpAction({
        mobile: parsed.data.mobile,
        fullName: parsed.data.fullName,
      });

      if (result.ok) {
        setSent(parsed.data.mobile);
        setSentName(parsed.data.fullName);
        return;
      }

      /*
       * A returning customer who came to the wrong page. They are told plainly,
       * because unlike the login page this is not a place where a stranger can
       * learn anything they did not already know by trying to sign up with their
       * own number.
       *
       * Keyed off the error code rather than the wording, so rewording the
       * message for a customer cannot quietly break this branch.
       */
      if (result.code === "MOBILE_ALREADY_REGISTERED") {
        setAlreadyRegistered(true);
        return;
      }

      setFormError(result.message);
    });
  }

  if (sent) {
    return (
      <OtpVerifyStage
        mobile={sent}
        fullName={sentName}
        intent="signup"
        redirectTo={redirectTo}
        devTestCode={devTestCode}
        onChangeNumber={() => {
          setSent(null);
          setSentName("");
          setFormError(null);
        }}
      />
    );
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit} noValidate>
      <div className="space-y-2">
        <Label htmlFor="fullName">Full name</Label>
        <Input
          id="fullName"
          name="fullName"
          autoComplete="name"
          placeholder=""
          aria-invalid={Boolean(errors.fullName)}
          aria-describedby={errors.fullName ? "fullName-error" : undefined}
          className="h-11"
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
          aria-invalid={Boolean(errors.mobile)}
          aria-describedby={errors.mobile ? "mobile-error" : undefined}
          className="h-11"
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

      {alreadyRegistered ? (
        <div className="bg-muted/40 space-y-3 rounded-xl border border-[var(--border)] p-4">
          <p className="text-sm">
            This mobile number is already registered. Please log in to your
            existing account.
          </p>
          <Button asChild variant="outline" className="w-full">
            <a href="/auth/login">Log in instead</a>
          </Button>
        </div>
      ) : null}

      {formError ? (
        <p role="alert" className="text-sm text-[var(--destructive)]">
          {formError}
        </p>
      ) : null}

      <Button
        className="w-full bg-[var(--primary)] text-[var(--primary-foreground)] shadow-[0_8px_24px_-8px_var(--primary)] transition-all hover:-translate-y-0.5 focus-visible:ring-[var(--ring)]/40 disabled:translate-y-0"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Sending code..." : "Send code"}
      </Button>
    </form>
  );
}
