import "server-only";

import { createServiceClient } from "@/db/server";
import type { Profile } from "@/db/types";
import { canonicalizeMobile } from "@/lib/mobile";

import { writeAudit } from "./audit";
import { mobileInvalid, walkInMobileIsStaff } from "./errors";

/**
 * Finding the customer behind a walk-in (section 8.11).
 *
 * A walk-in is an ordinary order with `source = walk_in`, so the booking itself
 * needs nothing new - `createPickupOrder` already books on another profile's
 * behalf when the caller is staff or admin. The only genuinely new thing is the
 * customer: the counter has a name and a mobile number and no account.
 *
 * The rule that matters here is that a mobile number identifies **one** account.
 * `profiles_mobile_unique` enforces it in the database, so the choice is between
 * reusing the existing profile and failing; creating a second account for a
 * regular customer is not on the table, and neither is renaming them.
 *
 * Everything below goes through the service client, because it has to: the
 * profile row is created by an `on_auth_user_created` trigger when the auth user
 * is created, and `update on profiles` is revoked from `authenticated`. The
 * admin check happens in the action, which is the gate for this module.
 */

type CustomerRow = Pick<Profile, "id" | "full_name" | "role">;

/**
 * What to do about the number the counter typed.
 *
 * Pure and separate from the queries so the decision can be tested without a
 * database: it is the part with a rule in it, and the queries around it are
 * plumbing.
 *
 * `reject` carries no message because the caller already has the error for it -
 * a pure function should not be the second place that copy lives.
 */
export type WalkInCustomerDecision =
  | { action: "reuse"; profileId: string; fullName: string }
  | { action: "create"; fullName: string }
  | { action: "reject" };

export function decideWalkInCustomer(
  existing: CustomerRow | null,
  typedName: string,
): WalkInCustomerDecision {
  if (!existing) return { action: "create", fullName: typedName.trim() };

  /*
   * A staff or admin number is refused rather than reused. Booking on a
   * colleague's profile would put their name on the customer's delivery and
   * their orders in the customer's history, and would look correct in the
   * database right up until somebody read the row.
   */
  if (existing.role !== "customer") return { action: "reject" };

  /*
   * An existing customer keeps the name on their account, and the typed name is
   * discarded. The counter typed a name because a form asked for one, not to
   * rename anybody; a receipt that renames its customer is worse than one that
   * keeps yesterday's spelling. `profiles.full_name` is `not null` with a
   * non-blank check, so there is always a name on file to keep.
   */
  return {
    action: "reuse",
    profileId: existing.id,
    fullName: existing.full_name,
  };
}

/** What the counter form should show under the mobile field. */
export type WalkInLookupResult =
  | { status: "new" }
  | { status: "existing"; profileId: string; fullName: string }
  | { status: "staff" };

/**
 * Looks up a mobile number without changing anything.
 *
 * Not required to take an order - `findOrCreateWalkInCustomer` makes the same
 * decision on submit - but it is what lets the form say "that is Asha Menon,
 * booking for her again" while the customer is still standing there, which is the
 * moment a typo is cheap to fix.
 */
export async function lookupWalkInCustomer(
  mobile: string,
): Promise<WalkInLookupResult> {
  const canonical = canonicalizeMobile(mobile);
  if (!canonical) throw mobileInvalid();

  const service = createServiceClient();

  const { data, error } = await service
    .from("profiles")
    .select("id, full_name, role")
    .eq("mobile", canonical)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return { status: "new" };
  if (data.role !== "customer") return { status: "staff" };

  return {
    status: "existing",
    profileId: data.id,
    fullName: data.full_name,
  };
}

export type WalkInCustomer = {
  profileId: string;
  fullName: string;
  /** Canonical E.164, as it was stored. */
  mobile: string;
  /** True when this call created the account rather than reusing one. */
  created: boolean;
};

/**
 * The profile a walk-in order is booked against, created if the number is new.
 *
 * Picks up the decision from {@link decideWalkInCustomer} and performs it. The
 * read and the write are not in one transaction, so two counters could in
 * principle register the same number at the same moment; the unique index on
 * `profiles.mobile` is what actually settles that, and the loser of the race gets
 * an error rather than a duplicate - which is the correct outcome.
 */
export async function findOrCreateWalkInCustomer(
  input: { fullName: string; mobile: string },
  actorId: string,
): Promise<WalkInCustomer> {
  const canonical = canonicalizeMobile(input.mobile);
  if (!canonical) throw mobileInvalid();

  const service = createServiceClient();

  const { data: existing, error } = await service
    .from("profiles")
    .select("id, full_name, role")
    .eq("mobile", canonical)
    .maybeSingle();

  if (error) throw new Error(error.message);

  const decision = decideWalkInCustomer(existing, input.fullName);

  if (decision.action === "reject") throw walkInMobileIsStaff();

  if (decision.action === "reuse") {
    return {
      profileId: decision.profileId,
      fullName: decision.fullName,
      mobile: canonical,
      created: false,
    };
  }

  // metadata.mobile is what the trigger reads, so it must already be canonical.
  const { data: created, error: createError } =
    await service.auth.admin.createUser({
      phone: canonical,
      phone_confirm: true,
      user_metadata: { full_name: decision.fullName, mobile: canonical },
    });

  if (createError || !created?.user) {
    throw new Error(
      `could not create the walk-in customer: ${createError?.message ?? "no user returned"}`,
    );
  }

  await writeAudit(service, {
    actorId,
    action: "walk_in.create_customer",
    entity: "profiles",
    entityId: created.user.id,
    before: null,
    after: { full_name: decision.fullName, mobile: canonical, source: "walk_in" },
  });

  return {
    profileId: created.user.id,
    fullName: decision.fullName,
    mobile: canonical,
    created: true,
  };
}
