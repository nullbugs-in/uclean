import type { Address, DbClient, Profile } from "../types";

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

/**
 * The signed-in user's profile.
 *
 * Name and mobile are read from here everywhere rather than copied into forms
 * or invoices at request time (section 6.1), so a profile edit shows up
 * everywhere immediately.
 */
export async function getProfile(
  client: Client,
  userId: string,
): Promise<Profile | null> {
  return unwrap(
    await client.from("profiles").select("*").eq("id", userId).maybeSingle(),
  );
}

/** Customer list for the admin panel (section 8.2). */
export async function listCustomers(
  client: Client,
  options: { search?: string; limit?: number } = {},
): Promise<Profile[]> {
  let query = client
    .from("profiles")
    .select("*")
    .eq("role", "customer")
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 100);

  if (options.search) {
    // Escape the wildcards so a customer name containing % or _ cannot turn
    // the search into a full table scan.
    const safe = options.search.replace(/[%_]/g, "");
    if (safe)
      query = query.or(`full_name.ilike.%${safe}%,mobile.ilike.%${safe}%`);
  }

  return unwrap(await query);
}

export async function listStaffAndAdmins(client: Client): Promise<Profile[]> {
  return unwrap(
    await client
      .from("profiles")
      .select("*")
      .in("role", ["staff", "admin"])
      .order("full_name", { ascending: true }),
  );
}

export async function listAddresses(
  client: Client,
  userId: string,
): Promise<Address[]> {
  return unwrap(
    await client
      .from("addresses")
      .select("*")
      .eq("user_id", userId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false }),
  );
}
