"use client";

import { useEffect } from "react";
import { CheckCircle2, MessageCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { siteConfig, whatsAppLink } from "@/config/site";

import { formatFullDate } from "../format";
import type { BookingSummary } from "../types";

/** How long the confirmation stays before the customer is sent home. */
const REDIRECT_AFTER_MS = 4000;

/** Step 5: confirmation, then back to the home page. */
export function SuccessStep({ summary }: { summary: BookingSummary }) {
  const router = useRouter();

  // The order number is on screen long enough to be read and copied, then the
  // customer is returned to the home page. Full order history lives under
  // My Account, reachable from the navbar once the profile menu is restored.
  useEffect(() => {
    const timer = window.setTimeout(
      () => router.replace("/"),
      REDIRECT_AFTER_MS,
    );
    return () => window.clearTimeout(timer);
  }, [router]);

  return (
    <div className="space-y-6 text-center">
      <div className="flex flex-col items-center gap-3">
        <span className="bg-primary text-primary-foreground grid size-14 place-items-center rounded-full">
          <CheckCircle2 className="size-7" aria-hidden="true" />
        </span>
        <h2 className="font-display text-2xl font-bold">
          Pickup booked successfully
        </h2>
        <p className="text-muted-foreground text-sm">
          We will collect your laundry on{" "}
          <strong className="text-foreground">
            {formatFullDate(summary.slotDate)}
          </strong>{" "}
          during the{" "}
          <strong className="text-foreground">{summary.slotLabel}</strong> slot.
        </p>
      </div>

      <div className="border-border bg-muted/40 mx-auto max-w-sm space-y-1 rounded-xl border p-4 text-sm">
        <p className="text-muted-foreground">Your order number</p>
        <p className="font-mono text-lg font-semibold tracking-wide">
          {summary.orderNo}
        </p>
        <p className="text-muted-foreground pt-2">
          Taking you back to the home page in a moment.
        </p>
      </div>

      <div className="flex flex-col justify-center gap-3 sm:flex-row">
        <Button asChild size="lg">
          <Link href="/">Back to home</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <a
            href={whatsAppLink(
              `Hi ${siteConfig.name}, I just booked pickup ${summary.orderNo}.`,
            )}
          >
            <MessageCircle aria-hidden="true" />
            Chat on WhatsApp
          </a>
        </Button>
      </div>

      <p className="text-muted-foreground text-xs">
        Keep this order number handy. You can also see it under My Account.
      </p>
    </div>
  );
}
