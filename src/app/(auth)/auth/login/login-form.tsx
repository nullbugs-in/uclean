"use client";

import { useState, useTransition } from "react";

import { OtpVerifyStage } from "@/components/otp-verify-stage";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { mobileSchema } from "@/lib/validation/auth";

import { requestLoginOtpAction } from "../actions";

/**
 * Login is mobile number and code, and nothing else.
 *
 * There is deliberately no name field: a returning customer must not be asked
 * for one again, and accepting one is what would let a login overwrite the name
 * on an existing profile.
 *
 * The confirmation shown after the code is requested is the same text whether or
 * not the number is registered. Anything more specific here would turn this page
 * into a way to list every customer who has an account.
 */
export function LoginForm({
  redirectTo,
  devTestCode,
}: {
  redirectTo: string;
  /** Non-null only in development, where the fixed code is shown as a hint. */
  devTestCode: string | null;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [unregistered, setUnregistered] = useState(false);
  const [isPending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setFormError(null);
    setUnregistered(false);

    const data = new FormData(event.currentTarget);
    const parsed = mobileSchema.safeParse(data.get("mobile"));

    if (!parsed.success) {
      setErrors({
        mobile:
          parsed.error.issues[0]?.message ?? "Enter a valid mobile number",
      });
      return;
    }

    startTransition(async () => {
      /*
       * `parsed.data` is already canonical, because the schema transforms on
       * the way through. This is the number the verify stage will use too, so
       * the two halves cannot address different accounts for one person.
       */
      const result = await requestLoginOtpAction({ mobile: parsed.data });

      if (result.ok) {
        setSent(parsed.data);
      } else {
        setFormError(result.message);
      }
    });
  }

  if (sent) {
    return (
      <>
        <OtpVerifyStage
          mobile={sent}
          intent="login"
          redirectTo={redirectTo}
          devTestCode={devTestCode}
          onChangeNumber={() => {
            setSent(null);
            setFormError(null);
          }}
          onUnregistered={() => setUnregistered(true)}
        />

        {/*
         * Shown only once the verify route reports that the number has no
         * account, which it does after the attempt limit rather than on the
         * request. Reaching this state has cost the person real attempts, so
         * telling them to sign up is worth the enumeration it permits.
         */}
        {unregistered ? (
          <div className="bg-muted/40 mt-4 space-y-3 rounded-xl border border-[var(--border)] p-4">
            <p className="text-sm">
              No account was found for this mobile number. Please create a new
              account to continue.
            </p>
            <Button asChild variant="outline" className="w-full">
              <a href="/auth/signup">Create an account</a>
            </Button>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit} noValidate>
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
          aria-describedby={errors.mobile ? "mobile-error" : "mobile-hint"}
          className="h-11"
        />
        <p id="mobile-hint" className="text-muted-foreground text-xs">
          Please enter your WhatsApp number, as you&apos;ll receive OTPs and all
          your booking and order notifications through WhatsApp.
        </p>
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
