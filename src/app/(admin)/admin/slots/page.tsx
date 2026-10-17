import type { Metadata } from "next";

import { PanelPage } from "@/components/panel/panel-page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getStoreSettings,
  listBlockedDateEntries,
  listTimeSlots,
} from "@/db/queries/catalog";
import { createClient } from "@/db/server";
import { DEFAULT_BOOKING_CUTOFF_MINUTES } from "@/server/slots";

import { BlockedDatesPanel } from "./blocked-dates-panel";
import { BookingRulesPanel } from "./booking-rules-panel";
import { SlotsPanel } from "./slots-panel";

export const metadata: Metadata = { title: "Time slots" };

/**
 * Time slot settings (section 8.10).
 *
 * The daily slots, their capacity, whether each is offered, the booking cut-off,
 * and the blocked dates the store is closed on.
 *
 * Capacity is what turns booking on: a slot at 0 reads as full, so until these
 * numbers are set the wizard offers nothing. The 2 PM to 3 PM break is already
 * absent from the slot list rather than a setting of its own, and the working
 * hours live on the store_settings row.
 *
 * Reads fall back to an empty list on error so the page still renders its forms
 * rather than dropping to an error boundary. The cut-off falls back to the
 * database's own default for the same reason: showing 60 when the row could not
 * be read is closer to the truth than showing 0, which means "no cut-off".
 */
export default async function AdminSlotsPage() {
  const supabase = await createClient();

  const [slots, blockedDates, store] = await Promise.all([
    listTimeSlots(supabase).catch(() => []),
    listBlockedDateEntries(supabase).catch(() => []),
    getStoreSettings(supabase).catch(() => null),
  ]);

  return (
    <PanelPage
      title="Time slots"
      description="Capacity per slot, whether a slot is offered, the booking cut-off, and blocked dates."
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daily slots</CardTitle>
        </CardHeader>
        <CardContent>
          <SlotsPanel slots={slots} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Booking cut-off</CardTitle>
        </CardHeader>
        <CardContent>
          <BookingRulesPanel
            cutoffMinutes={
              store?.booking_cutoff_minutes ?? DEFAULT_BOOKING_CUTOFF_MINUTES
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Blocked dates</CardTitle>
        </CardHeader>
        <CardContent>
          <BlockedDatesPanel dates={blockedDates} />
        </CardContent>
      </Card>
    </PanelPage>
  );
}
