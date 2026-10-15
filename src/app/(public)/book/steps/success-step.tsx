"use client";

import { CheckCircle2, MessageCircle } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { siteConfig, whatsAppLink } from "@/config/site";

import { formatFullDate } from "../format";
import type { BookingSummary } from "../types";

/** Step 5: confirmation. */
export function SuccessStep({ summary }: { summary: BookingSummary }) {
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
      </div>

      <div className="flex flex-col justify-center gap-3 sm:flex-row">
        <Button asChild size="lg">
          <Link href="/account/orders">Track my orders</Link>
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
