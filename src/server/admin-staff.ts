import "server-only";

import { createServiceClient } from "@/db/server";
import type { AppRole, DbClient } from "@/db/types";

import { writeAudit } from "./audit";

/**
 * Staff account operations (section 8.12).
 *
 * Every function writes through the service client, and that is the only reason
 * this module exists: migration 09 revoked `update on public.profiles` from
 * `authenticated` and granted back only `(full_name, mobile, email,
 * whatsapp_number)`, because `profiles_update_self` would otherwise have let a
 * signed-in customer run `update profiles set role = 'admin'`. So `role`,
 * `is_active` and `can_view_all_orders` can be written by nothing but the
 * service role - which means the `requireAdmin()` in the calling action is the
 * only gate standing here, and there is no policy behind it to fall back on.
 *
 * Nothing here creates an account. `createAgent` in admin-pickups.ts already
 * does, and it has to: a profile row is built by the `on_auth_user_created`
 * trigger, so an account cannot exist without the auth API.
 */

export class StaffAccountError extends Error {
  constructor(
    message: string,
    readonly userMessage: string,
  ) {
    super(message);
    this.name = "StaffAccountError";
  }
}

type StaffRow = {
  id: string;
  full_name: string;
  role: AppRole;
  is_active: boolean;
  can_view_all_orders: boolean;
};

async function readStaff(
  client: DbClient,
  profileId: string,
): Promise<StaffRow> {
  const { data, error } = await client
    .from("profiles")
    .select("id, full_name, role, is_active, can_view_all_orders")
    .eq("id", profileId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (!data) {
    throw new StaffAccountError(
      `profile ${profileId} not found`,
      "That staff account could not be found.",
    );
  }

  return data as StaffRow;
}

/**
 * Active admins left other than this one.
 *
 * A store with no active admin cannot assign work, bill a booking or read the
 * admin order book, and Phase 1 has no way to create one back - so every write
 * that could remove the last admin refuses it rather than succeeding and
 * leaving the store locked out.
 */
async function countOtherActiveAdmins(
  client: DbClient,
  excludeId: string,
): Promise<number> {
  const { count, error } = await client
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin")
    .eq("is_active", true)
    .neq("id", excludeId);

  if (error) throw new Error(error.message);

  return count ?? 0;
}

async function refuseLastAdmin(
  client: DbClient,
  current: StaffRow,
  wouldLoseAdmin: boolean,
): Promise<void> {
  if (!wouldLoseAdmin || !current.is_active) return;

  if ((await countOtherActiveAdmins(client, current.id)) > 0) return;

  throw new StaffAccountError(
    `profile ${current.id} is the last active admin`,
    "You are the only active admin, so this cannot be taken away. Make someone else an admin first.",
  );
}

/** Moves someone between customer, staff and admin. */
export async function setStaffRole(
  profileId: string,
  role: AppRole,
  actorId: string,
): Promise<void> {
  const service = createServiceClient();
  const current = await readStaff(service, profileId);

  if (current.role === role) return;

  await refuseLastAdmin(
    service,
    current,
    current.role === "admin" && role !== "admin",
  );

  const { error } = await service
    .from("profiles")
    .update({ role })
    .eq("id", profileId);

  if (error) throw new Error(error.message);

  await writeAudit(service, {
    actorId,
    action: "staff.role_changed",
    entity: "profile",
    entityId: profileId,
    before: { role: current.role },
    after: { role },
  });
}

/**
 * Takes access away, or gives it back.
 *
 * The one guard that is not about the store: an admin cannot deactivate their
 * own account. It would lock them out of the same screen they were just using,
 * and nothing here would let them undo it.
 */
export async function setStaffActive(
  profileId: string,
  isActive: boolean,
  actorId: string,
): Promise<void> {
  const service = createServiceClient();
  const current = await readStaff(service, profileId);

  if (!isActive && profileId === actorId) {
    throw new StaffAccountError(
      `profile ${profileId} tried to deactivate their own account`,
      "You cannot take away your own access. Ask another admin to do it.",
    );
  }

  await refuseLastAdmin(service, current, !isActive);

  const { error } = await service
    .from("profiles")
    .update({ is_active: isActive })
    .eq("id", profileId);

  if (error) throw new Error(error.message);

  await writeAudit(service, {
    actorId,
    action: "staff.active_changed",
    entity: "profile",
    entityId: profileId,
    before: { is_active: current.is_active },
    after: { is_active: isActive },
  });
}

/**
 * Store-wide order visibility.
 *
 * `is_store_staff()` is `role = 'staff' and can_view_all_orders`, so the flag is
 * meaningless on an admin, who already sees everything through `is_admin()`, and
 * on a customer, who has no panel to widen. Both are refused rather than
 * silently stored as a setting that does nothing.
 */
export async function setStoreWideVisibility(
  profileId: string,
  canViewAllOrders: boolean,
  actorId: string,
): Promise<void> {
  const service = createServiceClient();
  const current = await readStaff(service, profileId);

  if (current.role === "admin") {
    throw new StaffAccountError(
      `profile ${profileId} is an admin`,
      "Admins already see every order.",
    );
  }

  if (canViewAllOrders && current.role === "customer") {
    throw new StaffAccountError(
      `profile ${profileId} is a customer`,
      "Only staff can see the whole order book.",
    );
  }

  if (current.can_view_all_orders === canViewAllOrders) return;

  const { error } = await service
    .from("profiles")
    .update({ can_view_all_orders: canViewAllOrders })
    .eq("id", profileId);

  if (error) throw new Error(error.message);

  await writeAudit(service, {
    actorId,
    action: "staff.store_visibility_changed",
    entity: "profile",
    entityId: profileId,
    before: { can_view_all_orders: current.can_view_all_orders },
    after: { can_view_all_orders: canViewAllOrders },
  });
}
