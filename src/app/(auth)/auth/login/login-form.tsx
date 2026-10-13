"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { mobileSchema } from "@/lib/validation/auth";

import { requestLoginOtpAction } from "../actions";

export function LoginForm({ redirectTo }: { redirectTo: string }) {
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
        <Label htmlFor="mobile">Mobile number</Label>
        <Input
          id="mobile"
          name="mobile"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+919876543210"
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

      <Button className="w-full" disabled={isPending} type="submit">
        {isPending ? "Sending code..." : "Send code"}
      </Button>

      <p className="text-center text-sm text-[var(--muted-foreground)]">
        New to UClean?{" "}
        <a
          className="font-medium text-[var(--primary)] underline-offset-4 hover:underline"
          href={`/auth/signup?redirect=${encodeURIComponent(redirectTo)}`}
        >
          Create an account
        </a>
      </p>
    </form>
  );
}
