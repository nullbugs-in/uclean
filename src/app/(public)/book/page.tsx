import type { Metadata } from "next";

import { siteConfig } from "@/config/site";
import { getSessionUser } from "@/server/auth";
import { devOtpCode } from "@/server/otp";

import { BookWizard } from "./book-wizard";

export const metadata: Metadata = {
  title: "Book a Pickup",
  description:
    "Book a laundry pickup in four steps: verify your mobile number, enter your pickup address, choose a slot, and confirm.",
};

export default async function BookPage() {
  const session = await getSessionUser().catch(() => null);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <header className="mb-8 space-y-3">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Book a Pickup
        </h1>
        <p className="text-muted-foreground text-lg">
          {session
            ? "Confirm where we should collect from and pick a slot."
            : "Verify your mobile number, tell us where to collect, and pick a time slot."}
        </p>
      </header>

      <BookWizard
        maxRadiusKm={siteConfig.deliveryRadiusKm}
        devTestCode={devOtpCode()}
        initialIdentity={
          session
            ? {
                name: session.profile.full_name,
                mobile: session.profile.mobile,
              }
            : null
        }
      />
    </div>
  );
}
