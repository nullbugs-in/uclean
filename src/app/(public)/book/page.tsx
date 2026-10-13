import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { getAuthUser } from "@/server/auth";

export const metadata: Metadata = { title: "Book a Pickup" };

/**
 * Public Book Now page (section 5).
 *
 * Explains the four steps. If the visitor is not signed in the button sends
 * them to login with a redirect back to the wizard, so they land on
 * /account/book once OTP verification completes.
 */
export default async function BookNowPage() {
  const user = await getAuthUser();
  const target = user
    ? "/account/book"
    : "/auth/login?redirect=%2Faccount%2Fbook";

  const steps = [
    {
      title: "Check your location",
      body: "We confirm your address is within 6 km of the store by driving distance.",
    },
    {
      title: "Verify with an OTP",
      body: "A one time code confirms your mobile number.",
    },
    {
      title: "Pick a slot",
      body: "Choose a pickup slot between 10 AM and 8 PM, excluding the 2 to 3 PM break.",
    },
    {
      title: "Track your order",
      body: "Follow every step from pickup to delivery, with WhatsApp updates.",
    },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-10 px-4 py-16 sm:px-6">
      <header className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">
          Book a laundry pickup
        </h1>
        <p className="text-lg text-[var(--muted-foreground)]">
          Four steps from your door to a clean wardrobe.
        </p>
      </header>

      <ol className="space-y-6">
        {steps.map((step, index) => (
          <li key={step.title} className="flex gap-4">
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-sm font-semibold text-[var(--primary-foreground)]"
              aria-hidden="true"
            >
              {index + 1}
            </span>
            <div>
              <p className="font-medium">{step.title}</p>
              <p className="text-sm text-[var(--muted-foreground)]">
                {step.body}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 p-6">
        <p className="font-medium">
          Pickup is available only within 6 km driving distance.
        </p>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          You will be asked to accept this before choosing a slot.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button asChild size="lg">
          <Link href={target}>{user ? "Book Now" : "Sign in to Book"}</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/services">See prices first</Link>
        </Button>
      </div>
    </div>
  );
}
