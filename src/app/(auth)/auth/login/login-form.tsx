"use client";

import { useState, useTransition } from "react";

import { OtpVerifyStage } from "@/components/otp-verify-stage";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { mobileSchema } from "@/lib/validation/auth";

import { requestLoginOtpAction } from "../actions";

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
  const [isPending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setFormError(null);

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
      <OtpVerifyStage
        mobile={sent}
        redirectTo={redirectTo}
        devTestCode={devTestCode}
        onChangeNumber={() => {
          setSent(null);
          setFormError(null);
        }}
      />
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
