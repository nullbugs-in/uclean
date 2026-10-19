import "server-only";

import { createServiceClient } from "@/db/server";
import type { DbClient, Json, OrderStatus } from "@/db/types";
import { canonicalizeMobile } from "@/lib/mobile";

import { DomainError } from "./errors";

/**
 * Admin pickup operations.
 *
 * Every function here writes through the **service client**, which bypasses RLS
 * on purpose: `auto_assign_agent` is granted to `service_role` only, so an
 * admin's browser client cannot call it at all, and there is no INSERT policy on
 * `orders` for anyone. Bypassing RLS means the *only* gate is the one in the
 * calling action, so `requireAdmin()` there is load-bearing rather than
 * decoration. Nothing in the customer-facing booking path uses this module.
 *
 * This replaces `assignAgent` in `src/server/orders.ts`, which had no callers
 * and therefore no regression risk, and which recorded neither who had assigned
 * nor anything in `audit_logs`.
 */

export class PickupAssignmentError extends Error {
  constructor(
    message: string,
    readonly userMessage: string,
  ) {
    super(message);
    this.name = "PickupAssignmentError";
  }
}

/** Reads just enough of an order to decide what may be done to it. */
async function readOrder(client: DbClient, orderId: string) {
  const { data, error } = await client
    .from("orders")
    .select("id, order_no, status, pickup_slot_date, pickup_slot_id")
    .eq("id", orderId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    throw new PickupAssignmentError(
      `order ${orderId} not found`,
      "That pickup request could not be found.",
    );
  }

  return data;
}

/**
 * Removes an agent from the roster, including their login.
 *
 * The order of operations matters and is not reversible, so it runs strictly:
 *
 *   1. Release open assignments, so the pickups they were holding go back to
 *      the queue instead of being stranded with an agent who no longer exists.
 *      An unassigned pickup is a queue item; a pickup assigned to a deleted
 *      agent is nothing at all.
 *   2. Null `agent_id` on every remaining assignment row. This is what unblocks
 *      the delete: `pickup_assignments.agent_id` restricts deletion of the
 *      agent row, so without this step any agent who has ever been assigned a
 *      pickup could never be removed, ever.
 *   3. Delete the auth user. That cascades to `profiles`, which cascades to
 *      `agents`, which takes them out of the assignment pool for good.
 *
 * What this costs: their name no longer appears against the pickups they
 * collected, because step 2 is what makes step 3 possible. That trade is stated
 * in the UI before the admin confirms, and it is the same one the schema already
 * makes everywhere else a person is removed.
 *
 * What is kept: the assignment rows themselves, the orders, and the order status
 * history, so the record of the work survives.
 */
export async function removeAgent(
  agentId: string,
  actorId: string,
): Promise<{
  fullName: string;
  releasedPickups: number;
  loginRemoved: boolean;
}> {
  const service = createServiceClient();

  const { data: agent, error: agentError } = await service
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", agentId)
    .maybeSingle();

  if (agentError) throw new Error(agentError.message);

  if (!agent) {
    throw new PickupAssignmentError(
      `agent ${agentId} has no profile`,
      "That agent could not be found.",
    );
  }

  // An admin removing themselves would take their own access with them, and the
  // audit trail would then name an actor who no longer exists.
  if (agentId === actorId) {
    throw new PickupAssignmentError(
      "an admin cannot remove their own account",
      "You cannot remove your own agent account.",
    );
  }

  const { data: open } = await service
    .from("pickup_assignments")
    .select("order_id")
    .eq("agent_id", agentId)
    .in("status", ["assigned", "in_progress"]);

  const released = (open ?? []).length;

  if (released > 0) {
    // Cancelled rather than deleted: `refresh_agent_load` and the audit trail
    // both need to see these, and a cancelled assignment does not read as an
    // owner, so the pickups reappear under "Needs an agent".
    const { error: releaseError } = await service
      .from("pickup_assignments")
      .update({ status: "cancelled" })
      .eq("agent_id", agentId)
      .in("status", ["assigned", "in_progress"]);

    if (releaseError) throw new Error(releaseError.message);
  }

  // The step that unblocks removing the agents row.
  const { error: detachError } = await service
    .from("pickup_assignments")
    .update({ agent_id: null })
    .eq("agent_id", agentId);

  if (detachError) throw new Error(detachError.message);

  /*
   * Take them out of the roster directly, rather than leaning on the
   * auth.users -> profiles -> agents cascade.
   *
   * That cascade was the original design, and it made removal fail for anyone
   * who had ever booked laundry as a customer: `orders.customer_id references
   * profiles on delete restrict` blocks the profile delete, and GoTrue reports
   * it as "Database error deleting user" without ever exposing the constraint.
   * The old code tried to detect that by looking for "violates foreign key" in
   * the API error, which GoTrue never includes - so the friendly branch was
   * unreachable and every blocked removal showed the same generic failure.
   *
   * Deleting the agents row is the operation that actually means "remove from
   * the roster", and with the assignments detached above nothing references it.
   */
  const { error: rosterError } = await service
    .from("agents")
    .delete()
    .eq("id", agentId);

  if (rosterError) throw new Error(rosterError.message);

  /*
   * The login is a separate, best-effort step now. Removing an agent from the
   * pool must not depend on whether the database will let us erase a person's
   * account - so if something still references their profile, they come off the
   * roster and keep their login, and the admin is told that plainly rather than
   * being shown a failure for work that did succeed.
   */
  const { data: customerOrders } = await service
    .from("orders")
    .select("id")
    .eq("customer_id", agentId)
    .limit(1);

  let loginRemoved = true;

  if ((customerOrders ?? []).length === 0) {
    const { error: deleteError } = await service.auth.admin.deleteUser(agentId);

    if (deleteError) {
      loginRemoved = false;
      console.error(
        `Removed ${agentId} from the roster but could not delete their login`,
        deleteError,
      );
    }
  } else {
    loginRemoved = false;
  }

  await audit(service, {
    actorId,
    action: "agent.removed",
    entity: "agent",
    entityId: agentId,
    before: { full_name: agent.full_name, role: agent.role },
    after: {
      removed: true,
      released_pickups: released,
      login_removed: loginRemoved,
    },
  });

  return {
    fullName: agent.full_name,
    releasedPickups: released,
    loginRemoved,
  };
}

/**
 * Writes an admin action to the audit trail.
 *
 * Section 11 requires an audit log for admin actions and names reassignment
 * explicitly. `before` and `after` are the two shapes of the entity that the
 * action moved between, which is what makes the row useful later without having
 * to reconstruct it.
 */
async function audit(
  client: DbClient,
  input: {
    actorId: string;
    action: string;
    entity: string;
    entityId: string;
    // Typed as Json rather than Record<string, unknown> because these go
    // straight into jsonb columns, and the generated type is what proves it.
    before: Json;
    after: Json;
  },
): Promise<void> {
  const { error } = await client.from("audit_logs").insert({
    actor_id: input.actorId,
    action: input.action,
    entity: input.entity,
    entity_id: input.entityId,
    before: input.before,
    after: input.after,
  });

  // Deliberately not thrown. An audit failure must not undo an assignment the
  // agent is relying on, but it is loud in the logs rather than silent.
  if (error) console.error("Could not write the assignment audit row", error);
}

export type AssignmentOutcome = {
  agentId: string | null;
  agentName: string | null;
  automatic: boolean;
};

/** Which leg of the journey an assignment covers. */
export type AssignmentKind = "pickup" | "delivery";

/**
 * Statuses each leg can be assigned from.
 *
 * Pickup has to happen before collection, so the two pre-collection states are
 * the only ones. Delivery can only be arranged once the laundry is ready, and the
 * schema's own rule is that `ready_for_delivery` is the only way in, so that is
 * the only state listed.
 */
const ASSIGNABLE_STATUSES: Record<AssignmentKind, readonly OrderStatus[]> = {
  pickup: ["pickup_requested", "agent_assigned"],
  delivery: ["ready_for_delivery"],
};

const ASSIGNABLE_MESSAGE: Record<AssignmentKind, string> = {
  pickup:
    "This pickup can no longer be assigned. It may already have been collected.",
  delivery:
    "A delivery agent can only be assigned once the booking is marked ready for delivery.",
};

/**
 * Assigns a booking's pickup or delivery to a chosen agent.
 *
 * Reassigning is the same call: `pickup_assignments` has one row per
 * (order, type), so the upsert replaces the agent rather than adding a second
 * owner. `assigned_by` is recorded on both branches, because "which agent is
 * picking this up" is only half the question an audit has to answer.
 *
 * The kind is a parameter rather than two functions because the whole operation
 * is identical apart from the column value: the guard, the upsert, the audit
 * shape and the load refresh are all the same. What differs is only *when* each
 * leg may be assigned, and that is what `ASSIGNABLE_STATUSES` encodes.
 */
export async function assignPickupAgent(
  orderId: string,
  agentId: string,
  actorId: string,
  kind: AssignmentKind = "pickup",
): Promise<AssignmentOutcome> {
  const service = createServiceClient();
  const order = await readOrder(service, orderId);

  if (!ASSIGNABLE_STATUSES[kind].includes(order.status)) {
    throw new PickupAssignmentError(
      `order ${orderId} is ${order.status}`,
      ASSIGNABLE_MESSAGE[kind],
    );
  }

  const { data: agent, error: agentError } = await service
    .from("profiles")
    .select("id, full_name")
    .eq("id", agentId)
    .maybeSingle();

  if (agentError) throw new Error(agentError.message);

  if (!agent) {
    throw new PickupAssignmentError(
      `agent ${agentId} has no profile`,
      "That agent could not be found.",
    );
  }

  // The previous owner, for the audit row. Read before the upsert overwrites.
  const { data: previous } = await service
    .from("pickup_assignments")
    .select("agent_id, status, assigned_by")
    .eq("order_id", orderId)
    .eq("type", kind)
    .maybeSingle();

  const { error: upsertError } = await service
    .from("pickup_assignments")
    .upsert(
      {
        order_id: orderId,
        agent_id: agentId,
        type: kind,
        status: "assigned",
        assigned_by_type: "manual",
        // The column exists and was previously left null, which is what made the
        // "who assigned this" question unanswerable.
        assigned_by: actorId,
        completed_at: null,
      },
      { onConflict: "order_id,type" },
    );

  if (upsertError) throw new Error(upsertError.message);

  /*
   * Only the pickup leg moves the order. Assigning a pickup is what
   * `pickup_requested -> agent_assigned` means, and that transition is allowed.
   *
   * A delivery assignment has no transition of its own: `ready_for_delivery ->
   * out_for_delivery` describes the bag leaving the store, not who is carrying it,
   * and inventing a status for it would mean touching the state machine that
   * three other surfaces share. So naming a delivery agent changes who is on the
   * job and nothing about where the booking is.
   */
  if (kind === "pickup" && order.status === "pickup_requested") {
    const { error: statusError } = await service
      .from("orders")
      .update({ status: "agent_assigned" })
      .eq("id", orderId);

    if (statusError) throw new Error(statusError.message);
  }

  await audit(service, {
    actorId,
    action: previous ? `${kind}.reassigned` : `${kind}.assigned`,
    entity: "order",
    entityId: orderId,
    before: {
      agent_id: previous?.agent_id ?? null,
      status: order.status,
      assigned_by: previous?.assigned_by ?? null,
      type: kind,
    },
    after: {
      agent_id: agentId,
      status: kind === "pickup" ? "agent_assigned" : order.status,
      assigned_by: actorId,
      type: kind,
    },
  });

  return { agentId, agentName: agent.full_name, automatic: false };
}

/**
 * Runs the automatic assignment rule.
 *
 * Section 6.3 Phase 1: active agents, free in that slot, lowest load wins. The
 * zone preference cannot be applied because `orders` carries no locality or
 * pincode, so `p_zone` is passed as null exactly as the previous implementation
 * did. `auto_assign_agent` returns null when nobody is free, which is a normal
 * outcome rather than an error: the request simply stays unassigned for a manual
 * pick.
 */
export async function autoAssignPickup(
  orderId: string,
  actorId: string,
): Promise<AssignmentOutcome> {
  const service = createServiceClient();
  const order = await readOrder(service, orderId);

  // The automatic rule only ever handles the pickup leg: it selects on slot
  // capacity, which exists for collection and not for delivery.
  if (!ASSIGNABLE_STATUSES.pickup.includes(order.status)) {
    throw new PickupAssignmentError(
      `order ${orderId} is ${order.status}`,
      "This pickup can no longer be assigned.",
    );
  }

  const { data: assigned, error: rpcError } = await service.rpc(
    "auto_assign_agent",
    {
      p_order_id: orderId,
      p_slot_date: order.pickup_slot_date,
      p_slot_id: order.pickup_slot_id,
      // Documented gap: the doc's locality rule needs a locality on the order,
      // and there is not one. See migration 05 for what does exist.
      p_zone: null,
    },
  );

  if (rpcError) throw new Error(rpcError.message);

  const agentId = assigned ?? null;

  if (!agentId) {
    return { agentId: null, agentName: null, automatic: true };
  }

  const { data: agent } = await service
    .from("profiles")
    .select("full_name")
    .eq("id", agentId)
    .maybeSingle();

  await audit(service, {
    actorId,
    action: "pickup.auto_assigned",
    entity: "order",
    entityId: orderId,
    before: { agent_id: null, status: order.status },
    after: { agent_id: agentId, status: "agent_assigned" },
  });

  return { agentId, agentName: agent?.full_name ?? null, automatic: true };
}

/**
 * Releases a pickup so it can be assigned again.
 *
 * The assignment row is marked cancelled rather than deleted: the audit trail
 * and `refresh_agent_load` both need to see it, and a cancelled assignment does
 * not read as an owner, so the request reappears in the unassigned filter.
 */
export async function unassignPickup(
  orderId: string,
  actorId: string,
): Promise<AssignmentOutcome> {
  const service = createServiceClient();
  const order = await readOrder(service, orderId);

  const { data: previous } = await service
    .from("pickup_assignments")
    .select("agent_id, status, assigned_by")
    .eq("order_id", orderId)
    .eq("type", "pickup")
    .maybeSingle();

  if (!previous) {
    throw new PickupAssignmentError(
      `order ${orderId} has no assignment to release`,
      "That pickup is not assigned to anyone.",
    );
  }

  const { error: updateError } = await service
    .from("pickup_assignments")
    .update({ status: "cancelled" })
    .eq("order_id", orderId)
    .eq("type", "pickup");

  if (updateError) throw new Error(updateError.message);

  // agent_assigned -> pickup_requested is not an allowed transition, and rightly
  // so: an agent physically holding the items cannot be un-assigned. Releasing
  // is therefore only possible before collection.
  if (order.status === "agent_assigned") {
    throw new PickupAssignmentError(
      `order ${orderId} cannot return to pickup_requested`,
      "This pickup has already been assigned and cannot be released back to the queue.",
    );
  }

  await audit(service, {
    actorId,
    action: "pickup.unassigned",
    entity: "order",
    entityId: orderId,
    before: { agent_id: previous.agent_id, status: order.status },
    after: { agent_id: null, status: order.status },
  });

  return { agentId: null, agentName: null, automatic: false };
}

export type CreateAgentInput = {
  fullName: string;
  mobile: string;
  zone?: string;
  vehicle?: string;
};

/**
 * Creates an agent: a staff profile plus the agent row that carries their
 * workload.
 *
 * Three writes, and none of them can be done from the browser:
 *
 *   1. `auth.admin.createUser` with `phone_confirm`. `agents.id` is a profile id
 *      and a profile id is an auth user id, so there is no way to have an agent
 *      without one. The admin API is used because `[auth.email] enable_signup`
 *      is false and phone sign-up requires an OTP we would otherwise have to
 *      ask the new agent to complete before they exist.
 *   2. The `on_auth_user_created` trigger then builds the profile row itself,
 *      already canonicalised by `canonical_mobile`. It arrives with the default
 *      role, so the next step is to promote it to staff.
 *   3. The `agents` row, which is the only thing that puts this person in the
 *      assignment pool.
 *
 * Because `auth.users.phone` is set and confirmed, the agent signs in with the
 * same OTP flow as a customer. No password is ever created or stored.
 */
export async function createAgent(
  input: CreateAgentInput,
  actorId: string,
): Promise<{ agentId: string; fullName: string }> {
  const mobile = canonicalizeMobile(input.mobile);

  if (!mobile) {
    throw new PickupAssignmentError(
      `unusable mobile: ${input.mobile}`,
      "Enter a valid 10 digit mobile number.",
    );
  }

  const fullName = input.fullName.trim();

  if (fullName.length < 2) {
    throw new PickupAssignmentError(
      "name too short",
      "Enter the agent's name.",
    );
  }

  const service = createServiceClient();

  // metadata.mobile is what the trigger reads, so it must already be canonical.
  const { data, error } = await service.auth.admin.createUser({
    phone: mobile,
    phone_confirm: true,
    user_metadata: { full_name: fullName, mobile },
  });

  if (error) {
    // The common case is a second attempt with a number already registered.
    throw new PickupAssignmentError(
      `could not create agent user: ${error.message}`,
      "That mobile number is already registered. Find the existing agent instead.",
    );
  }

  const userId = data.user?.id;

  if (!userId) {
    throw new PickupAssignmentError(
      "agent user created without an id",
      "The agent account could not be created. Please try again.",
    );
  }

  const { error: roleError } = await service
    .from("profiles")
    .update({ role: "staff" })
    .eq("id", userId);

  if (roleError) throw new Error(roleError.message);

  const { error: agentError } = await service.from("agents").insert({
    id: userId,
    zone: input.zone?.trim() || null,
    vehicle: input.vehicle?.trim() || null,
    is_available: true,
  });

  if (agentError) throw new Error(agentError.message);

  await audit(service, {
    actorId,
    action: "agent.created",
    entity: "agent",
    entityId: userId,
    before: {},
    after: { full_name: fullName, mobile, zone: input.zone ?? null },
  });

  return { agentId: userId, fullName };
}

/**
 * Takes an agent in or out of the pool.
 *
 * The automatic rule filters on `is_available`, so this is how an agent who is
 * off duty is kept out of assignment without deleting them.
 */
export async function setAgentAvailability(
  agentId: string,
  isAvailable: boolean,
  actorId: string,
): Promise<void> {
  const service = createServiceClient();

  const { data, error } = await service
    .from("agents")
    .update({ is_available: isAvailable })
    .eq("id", agentId)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (!data) {
    throw new PickupAssignmentError(
      `agent ${agentId} not found`,
      "That agent could not be found.",
    );
  }

  await audit(service, {
    actorId,
    action: "agent.availability_changed",
    entity: "agent",
    entityId: agentId,
    before: {},
    after: { is_available: isAvailable },
  });
}

/**
 * Open pickups held by an agent, for the confirmation prompt.
 *
 * The admin is about to be told these go back to the queue, so the number is
 * fetched before the destructive call rather than reported afterwards as a
 * surprise.
 */
export async function countOpenPickupsForAgent(
  agentId: string,
): Promise<number> {
  const { count, error } = await createServiceClient()
    .from("pickup_assignments")
    .select("order_id", { count: "exact", head: true })
    .eq("agent_id", agentId)
    .in("status", ["assigned", "in_progress"]);

  if (error) throw new Error(error.message);

  return count ?? 0;
}

/** Turns a failure into something a customer-facing page can render. */
export function toAssignmentMessage(error: unknown): string {
  if (error instanceof PickupAssignmentError) return error.userMessage;

  if (error instanceof DomainError) return error.userMessage;

  console.error("Pickup assignment failed", error);

  return "We could not update that pickup. Please try again shortly.";
}
