import type { Metadata } from "next";

import { listAddresses } from "@/db/queries/profiles";
import { createClient } from "@/db/server";
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

  /**
   * A returning customer should not have to retype the address they gave us
   * last time. `listAddresses` already orders defaults first, so the first row
   * is the one worth offering. A read failure is not worth failing the page
   * over: the wizard still works, the field just starts empty.
   */
  const savedAddress = session
    ? await listAddresses(await createClient(), session.profile.id)
        .then((addresses) => addresses[0]?.address_text ?? "")
        .catch(() => "")
    : "";

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
        storeCenter={siteConfig.coordinates}
        maxRadiusKm={siteConfig.deliveryRadiusKm}
        devTestCode={devOtpCode()}
        initialAddress={savedAddress}
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
