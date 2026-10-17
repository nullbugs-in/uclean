import type { Metadata } from "next";
import Link from "next/link";
import { Settings2 } from "lucide-react";

import { PanelPage } from "@/components/panel/panel-page";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getStoreSettings, listActiveServices } from "@/db/queries/catalog";
import { createClient } from "@/db/server";
import { addDays, toDateKey } from "@/lib/dates";
import { requireAdmin } from "@/server/auth";
import { getSlotsForRange, selectableSlots } from "@/server/slots";

import { WalkInForm } from "../../_components/walk-in-form";

export const metadata: Metadata = { title: "Walk-in customers" };

/**
 * How far ahead the counter can book.
 *
 * Matches the wizard's horizon, and it is a product decision rather than a limit
 * of the data: `time_slots` describes recurring slots, so availability exists for
 * any future date and reading sixty days costs the same three queries as reading
 * one. The whole window is sent to the form at once so a walk-in never waits on a
 * round trip for a date change - a counter is the one place where a spinner costs
 * a customer standing at a desk.
 */
const SLOT_WINDOW_DAYS = 60;

function upcomingDateKeys(count: number): string[] {
  const today = new Date();

  return Array.from({ length: count }, (_, offset) =>
    toDateKey(addDays(today, offset)),
  );
}

/**
 * Walk-in management (section 8.11).
 *
 * The counter takes an order for someone who did not book online. The design
 * decision worth stating is that this is **the same order** as an online one:
 * `source = walk_in`, the same services, the same slots, the same zone check, and
 * the same `createPickupOrder` path. Nothing here re-implements the booking rules,
 * so a walk-in cannot be booked into a full slot or an out-of-zone address that
 * the website would have refused, and the sales report needs no special case to
 * count it.
 *
 * What is genuinely new is only the customer: a name and a mobile number with no
 * account behind them.
 */
export default async function AdminWalkInPage() {
  await requireAdmin();

  const supabase = await createClient();

  const [settings, services] = await Promise.all([
    getStoreSettings(supabase),
    listActiveServices(supabase),
  ]);

  /*
   * The store's coordinates are what the 6 km check measures from, and the map is
   * drawn around them. Without them nothing can be booked - online or at the
   * counter - so the page says so plainly and points at Settings rather than
   * rendering a form whose every submission fails.
   */
  if (!settings || settings.lat === null || settings.lng === null) {
    return (
      <PanelPage
        title="Walk-in customers"
        description="Create a customer, add an order manually, generate a bill."
      >
        <Card className="border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings2 className="size-4" aria-hidden />
              Set the store location first
            </CardTitle>
            <CardDescription>
              Bookings measure the pickup distance from the store, so both the
              website and the counter are blocked until it is configured.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/admin/settings">Open Settings</Link>
            </Button>
          </CardContent>
        </Card>
      </PanelPage>
    );
  }

  const dateKeys = upcomingDateKeys(SLOT_WINDOW_DAYS);
  const availability = await getSlotsForRange(supabase, dateKeys);
  const todayKey = dateKeys[0] ?? toDateKey(new Date());

  const slotDays = dateKeys.map((dateKey) => {
    const day = availability.get(dateKey);

    return {
      dateKey,
      isBlocked: day?.isBlocked ?? false,
      slots: selectableSlots(day?.slots ?? []).map((entry) => ({
        id: entry.slot.id,
        label:
          entry.slot.label ??
          `${entry.slot.start_time} - ${entry.slot.end_time}`,
        remaining: entry.remaining,
      })),
    };
  });

  return (
    <PanelPage
      title="Walk-in customers"
      description="Create a customer, add an order manually, generate a bill."
    >
      <WalkInForm
        todayKey={todayKey}
        center={{ lat: settings.lat, lng: settings.lng }}
        maxRadiusKm={settings.max_radius_km}
        services={services.map((service) => ({
          id: service.id,
          name: service.name,
          unit: service.unit,
          price: service.price,
        }))}
        slotDays={slotDays}
      />
    </PanelPage>
  );
}
