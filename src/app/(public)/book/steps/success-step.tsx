"use client";

import {
  ArrowRight,
  CheckCircle2,
  MapPin,
  MessageCircle,
  Plus,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { siteConfig, whatsAppLink } from "@/config/site";

import { formatFullDate } from "../format";
import type { AddressSaveState, BookingSummary } from "../types";

/**
 * Step 6: the confirmation.
 *
 * This is where the customer is left. There is no timed redirect, because
 * being moved to the home page four seconds after booking throws away the
 * order number and the address we just wrote down, both of which people tend
 * to want at exactly that moment. Every exit is a button the customer presses
 * on purpose.
 *
 * No amount is quoted here either, for the same reason as the confirm step.
 */
export function SuccessStep({
  summary,
  addressSaveState,
}: {
  summary: BookingSummary;
  /** Whether their address reached their profile, so we can say so honestly. */
  addressSaveState?: AddressSaveState;
}) {
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

      <div className="border-border bg-muted/40 mx-auto max-w-sm space-y-3 rounded-xl border p-4 text-sm">
        <div>
          <p className="text-muted-foreground">Your order number</p>
          <p className="font-mono text-lg font-semibold tracking-wide">
            {summary.orderNo}
          </p>
        </div>

        <p className="text-muted-foreground flex items-start gap-1.5 border-t pt-3 text-left text-xs">
          <MapPin aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Collecting from{" "}
            <span className="text-foreground">{summary.addressText}</span>
          </span>
        </p>
      </div>

      {/*
       * Only when the save actually failed. Saying nothing would leave a
       * customer believing their address is on their profile when it is not, and
       * the next booking would then ask for it all over again with no
       * explanation.
       */}
      {addressSaveState === "failed" ? (
        <p className="mx-auto max-w-sm rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-left text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          Your pickup is booked, but we could not save this address to your
          profile. You can add it any time from{" "}
          <Link
            href="/account/profile"
            className="underline underline-offset-2"
          >
            your profile
          </Link>
          .
        </p>
      ) : null}

      <div className="flex flex-col justify-center gap-3 sm:flex-row">
        <Button asChild size="lg" className="sm:min-w-52">
          <Link href="/account/orders">
            View my bookings
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/book">
            <Plus aria-hidden="true" />
            Book another pickup
          </Link>
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
        Keep this order number handy. You can also see it any time under{" "}
        <Link
          href="/account/orders"
          className="text-foreground underline underline-offset-2"
        >
          My bookings
        </Link>
        .
      </p>
    </div>
  );
}
