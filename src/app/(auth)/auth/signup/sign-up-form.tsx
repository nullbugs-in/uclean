"use client";

import { useState, useTransition } from "react";

import { OtpVerifyStage } from "@/components/otp-verify-stage";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { signUpSchema } from "@/lib/validation/auth";

import { requestLoginOtpAction } from "../actions";

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
      const result = await requestLoginOtpAction({
        mobile: parsed.data.mobile,
        fullName: parsed.data.fullName,
      });

      if (result.ok) {
        setSent(parsed.data.mobile);
        setSentName(parsed.data.fullName);
      } else {
        setFormError(result.message);
      }
    });
  }

  if (sent) {
    return (
      <OtpVerifyStage
        mobile={sent}
        fullName={sentName}
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
