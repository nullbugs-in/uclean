import "server-only";

import type { BlockedDate, DbClient, Json, TimeSlot } from "@/db/types";

/**
 * Time slot and blocked date writes, for the admin Slots page.
 *
 * Takes the request-scoped client rather than the service role on purpose, the
 * same choice `store-settings.ts` makes: `time_slots_admin_write` and
 * `blocked_dates_admin_write` are what authorise these writes, so the database
 * is the gate as well as the calling action.
 *
 * Separate from `slots.ts`, which is the read side the booking wizard uses.
 * That module answers "what can a customer book"; this one answers "what has an
 * admin changed", and the two only share the tables they touch.
 *
 * Out of the `"use server"` action file so it is ordinary server code that takes
 * a client and can be tested against a fake.
 */

export class SlotSettingsError extends Error {
  constructor(
    message: string,
    readonly userMessage: string,
  ) {
    super(message);
    this.name = "SlotSettingsError";
  }
}

export type SlotDraft = {
  id: string;
  capacity: number;
  label: string | null;
  isActive: boolean;
};

const SLOT_ACTION = "time_slots.updated";
const BLOCKED_INSERT_ACTION = "blocked_dates.added";
const BLOCKED_DELETE_ACTION = "blocked_dates.removed";

/** The fields the audit trail records for a slot. */
function auditableSlot(row: TimeSlot): Json {
  return {
    start_time: row.start_time,
    end_time: row.end_time,
    label: row.label,
    capacity: row.capacity,
    is_active: row.is_active,
  };
}

/**
 * Writes one admin change to the audit trail.
 *
 * Deliberately not thrown, matching `store-settings.ts`: an audit failure must
 * not roll back a change the admin believes they made, but it is loud rather
 * than silent.
 */
async function audit(
  client: DbClient,
  input: {
    actorId: string;
    action: string;
    entity: string;
    entityId: string;
    before: Json | null;
    after: Json | null;
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

  if (error)
    console.error(`Could not write the ${input.action} audit row`, error);
}

/**
 * Saves the editable fields of every slot in one pass, and returns the rows
 * that actually changed.
 *
 * The whole grid is submitted together, so this diffs against the stored rows
 * and writes only what moved. That matters for more than tidiness: a no-op
 * update would bump `updated_at` and leave an audit row claiming a change that
 * did not happen, which is exactly what makes an audit trail untrustworthy.
 *
 * A slot id that no longer exists is an error rather than a silent skip. The
 * only way to reach it is a stale form or a slot deleted out from under the
 * admin, and quietly ignoring it would report success for a change that was
 * never applied.
 */
export async function updateTimeSlots(
  client: DbClient,
  actorId: string,
  drafts: SlotDraft[],
): Promise<TimeSlot[]> {
  const { data: existing, error: readError } = await client
    .from("time_slots")
    .select("*")
    .in(
      "id",
      drafts.map((draft) => draft.id),
    );

  if (readError) throw new Error(readError.message);

  const byId = new Map((existing ?? []).map((row) => [row.id, row]));
  const changed: TimeSlot[] = [];

  for (const draft of drafts) {
    const before = byId.get(draft.id);

    if (!before) {
      throw new SlotSettingsError(
        `time_slot ${draft.id} does not exist`,
        "A slot you edited no longer exists. Reload the page and try again.",
      );
    }

    const label = draft.label ?? null;

    if (
      before.capacity === draft.capacity &&
      before.is_active === draft.isActive &&
      (before.label ?? null) === label
    ) {
      continue;
    }

    const { data: after, error } = await client
      .from("time_slots")
      .update({ capacity: draft.capacity, label, is_active: draft.isActive })
      .eq("id", draft.id)
      .select("*")
      .maybeSingle();

    if (error) throw new Error(error.message);

    if (!after) {
      throw new SlotSettingsError(
        `time_slots update returned no row for ${draft.id}`,
        "We could not save the slots. Please try again.",
      );
    }

    await audit(client, {
      actorId,
      action: SLOT_ACTION,
      entity: "time_slots",
      entityId: after.id,
      before: auditableSlot(before),
      after: auditableSlot(after),
    });

    changed.push(after);
  }

  return changed;
}

/**
 * Blocks a date, so `getSlotAvailability` refuses it for the whole day.
 *
 * A duplicate is reported as a friendly error rather than a raw constraint
 * violation, because "that date is already blocked" is an answer and
 * `duplicate key value violates unique constraint` is not.
 */
export async function addBlockedDate(
  client: DbClient,
  actorId: string,
  input: { date: string; reason: string | null },
): Promise<BlockedDate> {
  const { data, error } = await client
    .from("blocked_dates")
    .insert({ date: input.date, reason: input.reason })
    .select("*")
    .maybeSingle();

  if (error) {
    // 23505 is a unique violation: the date is already blocked.
    if (error.code === "23505" || /duplicate key/i.test(error.message)) {
      throw new SlotSettingsError(
        `blocked_dates already contains ${input.date}`,
        `${input.date} is already blocked.`,
      );
    }

    throw new Error(error.message);
  }

  if (!data) {
    throw new SlotSettingsError(
      "blocked_dates insert returned no row",
      "We could not block that date. Please try again.",
    );
  }

  await audit(client, {
    actorId,
    action: BLOCKED_INSERT_ACTION,
    entity: "blocked_dates",
    entityId: data.date,
    before: null,
    after: { date: data.date, reason: data.reason },
  });

  return data;
}

/**
 * Unblocks a date.
 *
 * Reads first so the audit row can carry what was removed: a delete with no
 * `before` is indistinguishable from a change that never happened.
 */
export async function removeBlockedDate(
  client: DbClient,
  actorId: string,
  date: string,
): Promise<void> {
  const { data: before, error: readError } = await client
    .from("blocked_dates")
    .select("*")
    .eq("date", date)
    .maybeSingle();

  if (readError) throw new Error(readError.message);

  if (!before) {
    throw new SlotSettingsError(
      `blocked_dates does not contain ${date}`,
      "That date is not blocked.",
    );
  }

  const { error } = await client
    .from("blocked_dates")
    .delete()
    .eq("date", date);

  if (error) throw new Error(error.message);

  await audit(client, {
    actorId,
    action: BLOCKED_DELETE_ACTION,
    entity: "blocked_dates",
    entityId: before.date,
    before: { date: before.date, reason: before.reason },
    after: null,
  });
}
