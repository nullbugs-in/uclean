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
