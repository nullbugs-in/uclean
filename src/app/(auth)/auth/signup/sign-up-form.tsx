"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { signUpSchema } from "@/lib/validation/auth";

import { requestLoginOtpAction } from "../actions";

export function SignUpForm({ redirectTo }: { redirectTo: string }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
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
      } else {
        setFormError(result.message);
      }
    });
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-[var(--muted-foreground)]">
          We sent a 6 digit code to{" "}
          <span className="text-foreground font-medium">{sent}</span>.
        </p>
        <form
          action={`/auth/verify-otp?mobile=${encodeURIComponent(sent)}&redirect=${encodeURIComponent(redirectTo)}`}
        >
          <Button className="w-full" type="submit">
            Enter the code
          </Button>
        </form>
      </div>
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

      <p className="text-center text-sm text-[var(--muted-foreground)]">
        Already have an account?{" "}
        <a
          className="font-medium text-[color-mix(in_oklab,var(--primary),black_35%)] underline-offset-4 hover:underline"
          href={`/auth/login?redirect=${encodeURIComponent(redirectTo)}`}
        >
          Sign in
        </a>
      </p>
    </form>
  );
}
