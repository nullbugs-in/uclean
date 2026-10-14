import type { Metadata } from "next";
import Link from "next/link";
import {
  CalendarClock,
  MapPin,
  Radar,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "Book a Pickup",
  description:
    "Book a laundry pickup in four steps: check your location, verify with an OTP, choose a slot, and track your order.",
};

const STEPS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: MapPin,
    title: "Check your location",
    body: `We confirm your address is within ${siteConfig.deliveryRadiusKm} km of the store.`,
  },
  {
    icon: ShieldCheck,
    title: "Verify with an OTP",
    body: "A one-time code confirms your mobile number.",
  },
  {
    icon: CalendarClock,
    title: "Choose a slot",
    body: "Pick a pickup slot between 10 AM - 2 PM or 3 PM - 8 PM.",
  },
  {
    icon: Radar,
    title: "Get order updates",
    body: "Track every step from pickup to delivery.",
  },
];

export default function BookPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
      <header className="space-y-3">
        <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
          Book a Pickup
        </h1>
        <p className="text-muted-foreground text-lg">
          Four quick steps from your door to a fresh wardrobe.
        </p>
      </header>

      <ol className="mt-10 space-y-4">
        {STEPS.map((step, stepIndex) => {
          const Icon = step.icon;
          return (
            <li
              key={step.title}
              className="border-border bg-card flex gap-4 rounded-2xl border p-5 shadow-sm"
            >
              <span
                aria-hidden="true"
                className="bg-primary text-primary-foreground grid size-11 shrink-0 place-items-center rounded-xl"
              >
                <Icon className="size-5" />
              </span>
              <div>
                <p className="font-semibold">
                  <span className="text-muted-foreground">
                    Step {stepIndex + 1}.
                  </span>{" "}
                  {step.title}
                </p>
                <p className="text-muted-foreground mt-1 text-sm">
                  {step.body}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="border-border bg-muted/40 mt-8 rounded-2xl border p-6">
        <p className="font-medium">
          Pickup and delivery is free within {siteConfig.deliveryRadiusKm} km.
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          You will confirm your address before choosing a slot.
        </p>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild size="lg">
          <Link href="/auth/login?redirect=%2Faccount%2Fbook">Book Now</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/#services">See services and prices</Link>
        </Button>
      </div>
    </div>
  );
}
