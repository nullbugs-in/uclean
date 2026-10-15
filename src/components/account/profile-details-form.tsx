"use client";

import { useState, useTransition } from "react";
import {
  Loader2,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  UserRound,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";

import { updateProfileAction } from "@/app/(public)/account/actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import type { Profile } from "@/db/types";

import { GlassCard } from "./glass";

/**
 * The editable half of the profile page.
 *
 * Read mode is the server-rendered `<dl>` in page.tsx; this takes over when the
 * customer asks to edit. Kept as a separate client component so the page itself
 * stays a server component and the saved addresses below it are unaffected by
 * any of this state.
 *
 * Controlled fields rather than react-hook-form, matching the OTP forms
 * elsewhere in the app, so there is one form idiom in this codebase.
 */
export function ProfileDetailsSection({ profile }: { profile: Profile }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <ProfileDetailsForm
        profile={profile}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <GlassCard className="uc-fade-up" style={{ animationDelay: "60ms" }}>
      <div className="mb-5 flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setEditing(true)}
        >
          <Pencil aria-hidden="true" />
          Edit details
        </Button>
      </div>

      <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
        <Detail
          icon={<UserRound className="size-4" aria-hidden="true" />}
          label="Full name"
          value={profile.full_name}
        />
        <Detail
          icon={<Phone className="size-4" aria-hidden="true" />}
          label="Mobile"
          value={profile.mobile}
        />
        <Detail
          icon={<MessageCircle className="size-4" aria-hidden="true" />}
          label="WhatsApp"
          value={profile.whatsapp_number ?? "Not set"}
          muted={!profile.whatsapp_number}
        />
        <Detail
          icon={<Mail className="size-4" aria-hidden="true" />}
          label="Email"
          value={profile.email ?? "Not set"}
          muted={!profile.email}
        />
      </dl>
    </GlassCard>
  );
}

/** One read-only field: icon tile, label, value. */
function Detail({
  icon,
  label,
  value,
  muted = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-[color-mix(in_oklab,var(--uc-lime-500),transparent_78%)] text-[var(--uc-green-800)]"
      >
        {icon}
      </span>
      <div className="min-w-0">
        <dt className="text-muted-foreground text-xs tracking-wide uppercase">
          {label}
        </dt>
        <dd
          className={
            muted ? "text-muted-foreground text-sm" : "truncate font-medium"
          }
        >
          {value}
        </dd>
      </div>
    </div>
  );
}

export function ProfileDetailsForm({
  profile,
  onCancel,
}: {
  profile: Profile;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setFormError(null);
    setSaved(false);

    const data = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await updateProfileAction({
        fullName: text(data, "fullName"),
        mobile: text(data, "mobile"),
        email: text(data, "email"),
        whatsappNumber: text(data, "whatsappNumber"),
      });

      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        setFormError(result.message);
        return;
      }

      setSaved(true);
      // Pull the fresh profile through so the read view beside it reflects the
      // new name, mobile and initials without a manual reload.
      router.refresh();
    });
  }

  return (
    <GlassCard className="uc-fade-up" style={{ animationDelay: "60ms" }}>
      <form className="space-y-5" onSubmit={onSubmit} noValidate>
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-base font-semibold">Edit details</h3>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={isPending}
          >
            <X aria-hidden="true" />
            Cancel
          </Button>
        </div>

        <Field
          id="fullName"
          label="Full name"
          defaultValue={profile.full_name}
          autoComplete="name"
          error={errors.fullName}
        />

        {/*
          The mobile number is the login identity: an OTP is sent to it and the
          code is what grants the session. Changing it here changes who the
          account belongs to from the next sign-in onwards, with no
          confirmation step on the old number first.
        */}
        <Field
          id="mobile"
          label="Mobile number"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          defaultValue={profile.mobile}
          error={errors.mobile}
          hint="We send your one-time login code to this number."
        />

        <Field
          id="whatsappNumber"
          label="WhatsApp number"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          defaultValue={profile.whatsapp_number ?? ""}
          error={errors.whatsappNumber}
          hint="Optional. Where we send order updates."
        />

        <Field
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          defaultValue={profile.email ?? ""}
          error={errors.email}
          hint="Optional."
        />

        {formError ? (
          <p role="alert" className="text-sm text-[var(--destructive)]">
            {formError}
          </p>
        ) : null}

        {saved ? (
          <p
            role="status"
            className="text-sm font-medium text-[var(--uc-green-800)]"
          >
            Your details have been saved.
          </p>
        ) : null}

        <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
          {isPending ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" />
              Saving...
            </>
          ) : (
            "Save changes"
          )}
        </Button>
      </form>
    </GlassCard>
  );
}

/**
 * A form field as text.
 *
 * `FormData.get` is typed `FormDataEntryValue | null`, which includes `File`.
 * Every field here is a text input, so anything that is not a string is not a
 * value this form produced and collapses to "" for the schema to reject.
 */
function text(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}

function Field({
  id,
  label,
  hint,
  error,
  type = "text",
  inputMode,
  autoComplete,
  defaultValue,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  type?: string;
  inputMode?: "tel" | "email" | "text";
  autoComplete?: string;
  defaultValue: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="text-sm text-[var(--destructive)]"
        >
          {error}
        </p>
      ) : hint ? (
        <p className="text-muted-foreground text-xs">{hint}</p>
      ) : null}
    </div>
  );
}
