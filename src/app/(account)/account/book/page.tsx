import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/placeholder";
import { ZoneNotice } from "./zone-notice";

export const metadata: Metadata = { title: "Book a pickup" };

/**
 * Pickup booking wizard (section 6.2).
 *
 * The five steps land in Milestone 3. Step 0 renders now because the 6 km
 * notice is the one thing that gates the whole flow, and it belongs on screen
 * before anything else.
 *
 * Name and mobile are prefilled from `profiles` rather than typed, so a profile
 * edit shows up here immediately (section 6.1).
 */
export default function BookWizardPage() {
  return (
    <PagePlaceholder
      title="Book a pickup"
      description="Four steps: location check, OTP, slot, confirmation."
      milestone="Milestone 3"
    >
      <ZoneNotice maxRadiusKm={6} />

      <ol className="space-y-3 text-sm">
        {[
          { step: "Step 1", label: "Pickup details and location" },
          { step: "Step 2", label: "Verify your WhatsApp number with an OTP" },
          { step: "Step 3", label: "Choose a pickup slot" },
          { step: "Step 4", label: "Confirmation and tracking" },
        ].map((item) => (
          <li key={item.step} className="flex gap-3">
            <span className="w-16 shrink-0 font-medium text-[var(--muted-foreground)]">
              {item.step}
            </span>
            <span>{item.label}</span>
          </li>
        ))}
      </ol>

      <p className="text-sm text-[var(--muted-foreground)]">
        The location step calls{" "}
        <code className="text-xs">POST /api/distance</code>, which computes
        driving distance server side. book_pickup repeats the check inside the
        transaction, so the 6 km rule holds even if the browser request is
        edited.
      </p>
    </PagePlaceholder>
  );
}
