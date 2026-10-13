import type { Metadata } from "next";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Create your account" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect: redirectTo = "/account" } = await searchParams;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-6 text-sm text-[var(--muted-foreground)]">
          Enter your name and mobile number. We will send a one time code.
        </p>
        <SignUpForm redirectTo={redirectTo} />
      </CardContent>
    </Card>
  );
}
