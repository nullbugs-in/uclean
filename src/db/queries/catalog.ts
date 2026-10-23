import type {
  BlockedDate,
  DbClient,
  HeroSlide,
  StoreSettings,
  TimeSlot,
} from "../types";

type Client = DbClient;

function unwrap<T>(result: {
  data: T | null;
  error: { message: string } | null;
}): T {
  if (result.error) {
    throw new Error(result.error.message);
  }
  return result.data as T;
}

/** Active hero slides for the home page carousel. */
export async function listActiveHeroSlides(
  client: Client,
): Promise<HeroSlide[]> {
  return unwrap(
    await client
      .from("hero_slides")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
  );
}

/**
 * The contact-facing slice of store_settings: address, hours, WhatsApp number.
 *
 * Prefer this over the full row when a page only needs the contact block. The
 * coordinates are left out not because they are secret -- the public contact map
 * already points at the store -- but because this shape is what the marketing
 * section reads, and fields it ignores only invite drift.
 */
export async function getPublicStoreSettings(client: Client): Promise<{
  address: string | null;
  phone: string | null;
  whatsapp_number: string | null;
  opening_time: string;
  closing_time: string;
} | null> {
  const row = await getStoreSettings(client);
  if (!row) return null;

  return {
    address: row.address,
    phone: row.phone,
    whatsapp_number: row.whatsapp_number,
    opening_time: row.opening_time,
    closing_time: row.closing_time,
  };
}

/** Full store settings row, including coordinates. Server use only. */
export async function getStoreSettings(
  client: Client,
): Promise<StoreSettings | null> {
  return unwrap(
    await client
      .from("store_settings")
      .select("*")
      .eq("id", true)
      .maybeSingle(),
  );
}

/** Active slots. Capacity is whatever an admin has configured. */
export async function listActiveTimeSlots(client: Client): Promise<TimeSlot[]> {
  return unwrap(
    await client
      .from("time_slots")
      .select("*")
      .eq("is_active", true)
      .order("start_time", { ascending: true }),
  );
}

/**
 * Every slot, active or not, ordered by start time.
 *
 * Distinct from `listActiveTimeSlots` on purpose: a booked order has to keep
 * showing its slot label ("10 AM - 11 AM") for display even after an admin
 * deactivates that slot, so display code must not read through the is_active
 * filter.
 */
export async function listTimeSlots(client: Client): Promise<TimeSlot[]> {
  return unwrap(
    await client.from("time_slots").select("*").order("start_time", {
      ascending: true,
    }),
  );
}

/** Dates on which pickups are blocked, e.g. store holidays. */
export async function listBlockedDates(
  client: Client,
  from: string,
  to: string,
): Promise<string[]> {
  const rows = unwrap(
    await client
      .from("blocked_dates")
      .select("date")
      .gte("date", from)
      .lte("date", to),
  );
  return rows.map((row) => row.date);
}

/**
 * Every blocked date with its reason, for the admin Slots page.
 *
 * Distinct from `listBlockedDates` on purpose: availability only needs the
 * dates and asks for a window, while the admin edits them one at a time and
 * shows the reason, so this one is unbounded and carries the whole row.
 */
export async function listBlockedDateEntries(
  client: Client,
): Promise<BlockedDate[]> {
  return unwrap(
    await client
      .from("blocked_dates")
      .select("*")
      .order("date", { ascending: true }),
  );
}
