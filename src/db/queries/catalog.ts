import type {
  DbClient,
  HeroSlide,
  Service,
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

/** Active services in display order. Powers the public Services section. */
export async function listActiveServices(client: Client): Promise<Service[]> {
  return unwrap(
    await client
      .from("services")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
  );
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
 * Store settings for the public site: address, hours, WhatsApp number.
 *
 * Prefer this over fetching store_settings directly from a client component:
 * lat/lng are business sensitive and are only used by the server-side distance
 * check, so they have no business in the public bundle.
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
