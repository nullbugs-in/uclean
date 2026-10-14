import { redirect } from "next/navigation";

import { createClient } from "@/db/server";
import { listActiveTimeSlots, listBlockedDates } from "@/db/queries/catalog";
import { getSlotAvailability, selectableSlots } from "@/server/slots";
import { getProfile } from "@/db/queries/profiles";

import { BookingForm } from "./booking-form";

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default async function BookPickupPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const profile = await getProfile(supabase, user.id);
  if (!profile) redirect("/auth/login");

  const today = new Date();
  const dateKey = toDateKey(today);

  const [slots, availability, blockedDates] = await Promise.all([
    listActiveTimeSlots(supabase),
    getSlotAvailability(supabase, today),
    listBlockedDates(supabase, dateKey, dateKey),
  ]);

  const selectable = selectableSlots(availability);
  const whatsapp = profile.whatsapp_number ?? profile.mobile;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Book a Pickup</h1>
        <p className="text-sm text-muted-foreground">
          Pickups are available within 6 km driving distance. Enter your address
          to check serviceability.
        </p>
      </div>

      <BookingForm
        slots={slots}
        selectableSlots={selectable}
        blockedDates={blockedDates}
        defaultWhatsapp={whatsapp}
        fullName={profile.full_name}
      />
    </div>
  );
}
