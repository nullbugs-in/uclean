import type { Metadata } from "next";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect: redirectTo = "/account" } = await searchParams;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-6 text-sm text-[var(--muted-foreground)]">
          Enter your mobile number and we will send a one time code.
        </p>
        <LoginForm redirectTo={redirectTo} />
      </CardContent>
    </Card>
  );
}
