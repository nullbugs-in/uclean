import "server-only";

import type { DbClient, Json } from "@/db/types";

/**
 * One admin change, as it is written to `audit_logs`.
 *
 * `before` and `after` are the two shapes of the entity the action moved
 * between, which is what makes the row useful later without having to
 * reconstruct it. A creation has no `before` and a deletion has no `after`, so
 * both are nullable.
 */
export type AuditEntry = {
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
  before: Json | null;
  after: Json | null;
};

/**
 * Writes an admin change to the audit trail.
 *
 * Section 11 requires an audit log for admin actions. This is deliberately not
 * thrown: an audit failure must not roll back a change the admin believes they
 * made, and every caller would otherwise have to decide that for itself. It is
 * loud in the logs rather than silent.
 *
 * One helper rather than a copy per module, so the "never throws" rule and the
 * column names live in exactly one place.
 */
export async function writeAudit(
  client: DbClient,
  entry: AuditEntry,
): Promise<void> {
  const { error } = await client.from("audit_logs").insert({
    actor_id: entry.actorId,
    action: entry.action,
    entity: entry.entity,
    entity_id: entry.entityId,
    before: entry.before,
    after: entry.after,
  });

  if (error)
    console.error(`Could not write the ${entry.action} audit row`, error);
}
