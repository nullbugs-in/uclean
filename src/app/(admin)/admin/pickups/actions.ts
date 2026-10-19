"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/server/auth";
import {
  assignPickupAgent,
  autoAssignPickup,
  createAgent,
  removeAgent,
  setAgentAvailability,
  toAssignmentMessage,
  unassignPickup,
} from "@/server/admin-pickups";

/**
 * Admin pickup actions.
 *
 * Every one of these opens with `requireAdmin()`, and that is not boilerplate.
 * The functions they call write through the service client, which bypasses RLS
 * entirely: `auto_assign_agent` is granted to `service_role` only, and there is
 * no INSERT policy on `orders`. So this check is the *only* thing standing
 * between a signed-in customer and the ability to assign themselves an agent or
 * edit the agent roster.
 */

export type PickupActionResult =
  | { ok: true; message?: string; agentName?: string | null }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

/**
 * Refreshes the list, the dashboard counts the pickup feeds, and the agent
 * roster - which is no longer only on this page.
 */
function revalidatePickupViews() {
  revalidatePath("/admin/pickups");
  revalidatePath("/admin/agents");
  revalidatePath("/admin");
}

const orderIdSchema = z.string().uuid("That pickup request could not be found");

function firstFieldError(error: {
  flatten: () => { fieldErrors: Record<string, string[] | undefined> };
}): Record<string, string> | undefined {
  const [entry] = Object.entries(error.flatten().fieldErrors);

  if (!entry) return undefined;

  const [field, messages] = entry;
  const message = messages?.[0];

  return message ? { [field]: message } : undefined;
}

/** Assigns a pickup to a chosen agent, or moves it to a different one. */
export async function assignAgentAction(input: {
  orderId: string;
  agentId: string;
}): Promise<PickupActionResult> {
  const parsed = z
    .object({
      orderId: orderIdSchema,
      agentId: z.string().uuid("Choose an agent"),
    })
    .safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      message: "Choose an agent for this pickup.",
      fieldErrors: firstFieldError(parsed.error),
    };
  }

  try {
    const admin = await requireAdmin();
    const result = await assignPickupAgent(
      parsed.data.orderId,
      parsed.data.agentId,
      admin.profile.id,
    );

    revalidatePickupViews();

    return {
      ok: true,
      agentName: result.agentName,
      message: result.agentName
        ? `Assigned to ${result.agentName}.`
        : "Assigned.",
    };
  } catch (error) {
    return { ok: false, message: toAssignmentMessage(error) };
  }
}

/** Runs the automatic assignment rule from section 6.3. */
export async function autoAssignAgentAction(input: {
  orderId: string;
}): Promise<PickupActionResult> {
  const parsed = z.object({ orderId: orderIdSchema }).safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "That pickup request could not be found." };
  }

  try {
    const admin = await requireAdmin();
    const result = await autoAssignPickup(
      parsed.data.orderId,
      admin.profile.id,
    );

    revalidatePickupViews();

    // A null agent is the normal "nobody is free" outcome, not a failure: the
    // request stays in the unassigned queue for a manual pick.
    if (!result.agentId) {
      return {
        ok: true,
        agentName: null,
        message: "No agent is free in that slot. Assign one by hand.",
      };
    }

    return {
      ok: true,
      agentName: result.agentName,
      message: `Assigned to ${result.agentName}.`,
    };
  } catch (error) {
    return { ok: false, message: toAssignmentMessage(error) };
  }
}

/** Releases a pickup so it can be assigned again. */
export async function unassignAgentAction(input: {
  orderId: string;
}): Promise<PickupActionResult> {
  const parsed = z.object({ orderId: orderIdSchema }).safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "That pickup request could not be found." };
  }

  try {
    const admin = await requireAdmin();
    await unassignPickup(parsed.data.orderId, admin.profile.id);

    revalidatePickupViews();

    return { ok: true, message: "Released back to the queue." };
  } catch (error) {
    return { ok: false, message: toAssignmentMessage(error) };
  }
}

const createAgentSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the agent's name").max(120),
  mobile: z.string().trim().min(10, "Enter a valid mobile number"),
  zone: z.string().trim().max(60).optional(),
  vehicle: z.string().trim().max(60).optional(),
});

/**
 * Adds an agent to the assignment pool.
 *
 * Exists because the `agents` table ships empty and there is no other route into
 * it, so without this the assignment dropdown has nothing to list and the
 * automatic rule has nobody to choose from.
 */
export async function createAgentAction(
  input: z.input<typeof createAgentSchema>,
): Promise<PickupActionResult> {
  const parsed = createAgentSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the agent's details.",
      fieldErrors: firstFieldError(parsed.error),
    };
  }

  try {
    const admin = await requireAdmin();
    const created = await createAgent(parsed.data, admin.profile.id);

    revalidatePickupViews();

    return {
      ok: true,
      message: `${created.fullName} can now be assigned pickups.`,
    };
  } catch (error) {
    return { ok: false, message: toAssignmentMessage(error) };
  }
}

/**
 * Removes an agent, including their login.
 *
 * Irreversible, so the server does two things the UI cannot: it refuses when the
 * admin is removing themselves, and it reports how many pickups were handed back
 * to the queue so the admin can be told rather than discovering it later.
 */
export async function removeAgentAction(input: {
  agentId: string;
}): Promise<PickupActionResult> {
  const parsed = z
    .object({ agentId: z.string().uuid("That agent could not be found") })
    .safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "That agent could not be found." };
  }

  try {
    const admin = await requireAdmin();
    const result = await removeAgent(parsed.data.agentId, admin.profile.id);

    revalidatePickupViews();

    // The consequence, stated rather than left for the admin to infer from an
    // empty roster.
    const released =
      result.releasedPickups === 0
        ? ""
        : ` ${result.releasedPickups} pickup${
            result.releasedPickups === 1 ? "" : "s"
          } went back to the queue.`;

    // They are off the roster either way; whether the login went with them is a
    // separate fact, and saying so is better than reporting a failure for the
    // half that worked.
    const login = result.loginRemoved
      ? ""
      : " Their login was kept, because customer orders still reference them.";

    return {
      ok: true,
      message: `${result.fullName} has been removed from the agent list.${released}${login}`,
    };
  } catch (error) {
    return { ok: false, message: toAssignmentMessage(error) };
  }
}

/** Takes an agent in or out of the pool the automatic rule draws from. */
export async function setAgentAvailabilityAction(input: {
  agentId: string;
  isAvailable: boolean;
}): Promise<PickupActionResult> {
  const parsed = z
    .object({
      agentId: z.string().uuid("That agent could not be found"),
      isAvailable: z.boolean(),
    })
    .safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "That agent could not be found." };
  }

  try {
    const admin = await requireAdmin();
    await setAgentAvailability(
      parsed.data.agentId,
      parsed.data.isAvailable,
      admin.profile.id,
    );

    revalidatePickupViews();

    return { ok: true, message: "Availability updated." };
  } catch (error) {
    return { ok: false, message: toAssignmentMessage(error) };
  }
}
