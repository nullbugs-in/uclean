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

export async function listActiveHeroSlides(client: Client): Promise<HeroSlide[]> {
  return unwrap(
    await client
      .from("hero_slides")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
  );
}

export async function getPublicStoreSettings(client: Client): Promise<{
  address: string | null;
  phone: string | null;
  whatsapp_number: string | null;
  opening_time: string;
  closing_time: string;
  break_start: string;
  break_end: string;
  max_radius_km: number;
  cut_off_minutes: number;
  auto_assign: boolean;
} | null> {
  const row = await getStoreSettings(client);
  if (!row) return null;

  return {
    address: row.address,
    phone: row.phone,
    whatsapp_number: row.whatsapp_number,
    opening_time: row.opening_time,
    closing_time: row.closing_time,
    break_start: row.break_start,
    break_end: row.break_end,
    max_radius_km: Number(row.max_radius_km),
    cut_off_minutes: row.cut_off_minutes,
    auto_assign: row.auto_assign,
  };
}

export async function getStoreSettings(client: Client): Promise<StoreSettings | null> {
  return unwrap(
    await client.from("store_settings").select("*").eq("id", true).maybeSingle(),
  );
}

export async function listActiveTimeSlots(client: Client): Promise<TimeSlot[]> {
  return unwrap(
    await client
      .from("time_slots")
      .select("*")
      .eq("is_active", true)
      .order("start_time", { ascending: true }),
  );
}

export async function listBlockedDates(
  client: Client,
  from: string,
  to: string,
): Promise<string[]> {
  const rows = unwrap(
    await client.from("blocked_dates").select("date").gte("date", from).lte("date", to),
  );
  return rows.map((row) => row.date);
}
