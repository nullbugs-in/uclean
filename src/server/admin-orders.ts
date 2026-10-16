import "server-only";

import { createClient } from "@/db/server";
import type { DbClient, OrderItem, OrderStatus } from "@/db/types";
import { canEditOrderItems } from "@/db/queries/admin-orders.view";

import { DomainError } from "./errors";

/**
 * Admin booking operations.
 *
 * Writes go through the request-scoped client, not the service role. That is a
 * deliberate difference from the pickup assignment path: the RLS policies
 * already permit an admin to update `orders`, `order_items`, `invoices` and
 * `payments`, so nothing here needs elevated access, and it means `auth.uid()` is
 * the real admin, which is what makes the audit trail name them.
 *
 * The one thing that cannot go through an ordinary update is a status change
 * carrying a note, because the note has to reach the trigger that writes the
 * history row. That goes through `admin_change_order_status` (migration 12) when
 * it is present, and falls back to a guarded direct update when it is not, so the
 * stage is editable either way.
 */

export class OrderEditError extends Error {
  constructor(
    message: string,
    readonly userMessage: string,
  ) {
    super(message);
    this.name = "OrderEditError";
  }
}

export class OrderConflictError extends OrderEditError {
  constructor(message: string) {
    super(
      message,
      "Someone else updated this booking a moment ago. Reload it.",
    );
    this.name = "OrderConflictError";
  }
}

export type OrderItemDraft = {
  id: string;
  qty: number;
  unitPrice: number;
};

export type UpdateItemsResult = {
  items: OrderItem[];
  total: number;
};

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export type AdvanceStatusInput = {
  orderId: string;
  to: OrderStatus;
  /** The status the caller was shown, so a concurrent change is detected. */
  expectedStatus: OrderStatus;
  note?: string | null;
  reason?: string | null;
};

/**
 * The result of moving a booking to a new stage.
 *
 * `noteDropped` is the one thing the caller has to be told about. The stage
 * change itself never half-happens: the history row, the audit row and the
 * customer message are written by a database trigger that fires on the update
 * whichever path was used. Only the free-text note has a path-dependent fate,
 * and an admin who typed one deserves to know if it did not survive.
 */
export type AdvanceStatusResult = {
  /** True when a note was supplied but could not be stored. */
  noteDropped: boolean;
};

/**
 * PostgREST's "no such function" codes.
 *
 * `PGRST202` is the schema-cache miss; `42883` is Postgres' undefined_function,
 * which surfaces if the cache is warm but the function still is not there. Both
 * mean the same thing here: migration 12 has not been applied to this database.
 */
const MISSING_FUNCTION_CODES = new Set(["PGRST202", "42883"]);

/**
 * Moves a booking to a status the state machine allows.
 *
 * Two paths, in order of preference.
 *
 * **Preferred: `admin_change_order_status` (migration 12).** It sets a
 * transaction-local GUC that the status trigger reads, which is the only way a
 * free-text note reaches `order_status_history.note`, and it compares
 * `p_expected_status` under a row lock, which is the only way two admins with the
 * same booking open are properly serialised.
 *
 * **Fallback: a guarded direct update.** The function is authored but may not be
 * applied yet, and a booking module where the stage cannot be changed at all is
 * worse than one without notes. The update carries `.eq("status", expected)`, so
 * optimistic concurrency still holds — PostgREST turns that into an
 * `UPDATE ... WHERE id = $1 AND status = $2`, and zero rows affected means
 * someone else moved the booking first. Everything else is unchanged, because
 * `enforce_order_transition` and `handle_order_status_change` are triggers on the
 * `orders` table and fire on any update, whoever makes it.
 *
 * There is deliberately no override on either path. The admin is held to exactly
 * the transition table a staff member is.
 */
export async function advanceOrderStatus(
  client: DbClient,
  input: AdvanceStatusInput,
): Promise<AdvanceStatusResult> {
  const note = input.note?.trim() || null;
  const reason = input.reason?.trim() || null;

  const { error } = await client.rpc("admin_change_order_status", {
    p_order_id: input.orderId,
    p_to_status: input.to,
    p_expected_status: input.expectedStatus,
    p_note: note,
    p_reason: reason,
  });

  if (!error) return { noteDropped: false };

  if (MISSING_FUNCTION_CODES.has(error.code ?? "")) {
    await changeStatusDirectly(client, input, reason);

    return { noteDropped: note !== null };
  }

  throw toStatusError(error);
}

/** The direct-update path, used when `admin_change_order_status` is absent. */
async function changeStatusDirectly(
  client: DbClient,
  input: AdvanceStatusInput,
  reason: string | null,
): Promise<void> {
  const patch: {
    status: OrderStatus;
    updated_at: string;
    cancellation_reason?: string;
  } = {
    status: input.to,
    updated_at: new Date().toISOString(),
  };

  // Mirrors what the function writes, and nothing more. `cancellation_reason` is
  // only ever a cancellation reason: the RPC this replaces used to write every
  // stage note there, so a pickup note later read as the reason for a
  // cancellation that never happened.
  if (input.to === "cancelled") {
    patch.cancellation_reason = reason ?? "No reason given";
  }

  const { data, error } = await client
    .from("orders")
    .update(patch)
    .eq("id", input.orderId)
    .eq("status", input.expectedStatus)
    .select("id")
    .maybeSingle();

  if (error) throw toStatusError(error);

  if (data) return;

  /*
   * Zero rows matched. Three things cause that and they need different answers,
   * so the current status is read back rather than guessed at.
   */
  const { data: current, error: readError } = await client
    .from("orders")
    .select("status")
    .eq("id", input.orderId)
    .maybeSingle();

  if (readError) throw new Error(readError.message);

  // Not visible at all, either because it does not exist or because this admin
  // is not allowed to see it. Both are "you cannot change this".
  if (!current) {
    throw new OrderEditError(
      `order ${input.orderId} is not visible`,
      "That booking could not be found.",
    );
  }

  // Still on the status the caller sent, yet the write did not land. That is not
  // a race, so reporting it as one would send the admin round a reload loop.
  if (current.status === input.expectedStatus) {
    throw new Error(
      `status update for order ${input.orderId} affected no rows`,
    );
  }

  throw new OrderConflictError(
    `order ${input.orderId} is now ${current.status}, not ${input.expectedStatus}`,
  );
}

/** Maps a Postgres error onto the sentence the page should show. */
function toStatusError(error: { code?: string | null; message: string }) {
  // 40001 is serialization_failure, which the RPC raises when the booking has
  // already moved on. The admin's next action is different from a generic
  // failure, so it gets its own message.
  if (error.code === "40001") {
    return new OrderConflictError(error.message);
  }

  // 23514 is a check violation, which is how `enforce_order_transition` rejects
  // an illegal jump. It should be unreachable from the admin UI, since the
  // buttons offered come from the same transition table, but a stale page could
  // reach it.
  if (error.code === "23514") {
    return new OrderEditError(
      error.message,
      "That step is not available from where this booking is now.",
    );
  }

  if (error.code === "42501") {
    return new OrderEditError(
      error.message,
      "You do not have access to this booking.",
    );
  }

  return new Error(error.message);
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

/**
 * Saves adjusted quantities and rates on a booking's lines.
 *
 * Two guards, both read from the database rather than trusted from the caller:
 *
 * 1. **Billing ownership.** `createInvoice` deletes every `order_items` row for
 *    an order and inserts its own, so an edit made after invoicing would be
 *    silently discarded. The lines lock rather than warn.
 *    `invoices.order_id` is not null unique, so its presence is a reliable
 *    signal.
 * 2. **Closed orders.** Nothing about a delivered or cancelled booking should
 *    still be editable.
 *
 * Only `qty` and `unit_price` are written. Names, notes and photos are not
 * accepted here: a line's identity is what the customer chose at booking, and
 * letting it be rewritten would make the record disagree with what they asked
 * for.
 *
 * Deliberately not a delete-and-reinsert like the billing path. Each line is
 * updated by its own id, scoped to this order, so a line id belonging to another
 * order cannot be written through here and a partial failure leaves the
 * untouched lines intact.
 */
export async function updateOrderItems(
  client: DbClient,
  orderId: string,
  drafts: OrderItemDraft[],
): Promise<UpdateItemsResult> {
  if (drafts.length === 0) {
    throw new OrderEditError(
      "no lines submitted",
      "There is nothing to save on this booking.",
    );
  }

  const [orderResult, invoiceResult] = await Promise.all([
    client.from("orders").select("id, status").eq("id", orderId).maybeSingle(),
    client.from("invoices").select("id").eq("order_id", orderId),
  ]);

  if (orderResult.error) throw new Error(orderResult.error.message);
  if (invoiceResult.error) throw new Error(invoiceResult.error.message);

  const order = orderResult.data;

  if (!order) {
    throw new OrderEditError(
      `order ${orderId} not found`,
      "That booking could not be found.",
    );
  }

  const gate = canEditOrderItems({
    hasInvoice: (invoiceResult.data ?? []).length > 0,
    status: order.status,
  });

  if (!gate.editable) {
    throw new OrderEditError(
      "order lines are locked",
      gate.reason ?? "Locked.",
    );
  }

  for (const draft of drafts) {
    if (!Number.isFinite(draft.qty) || draft.qty <= 0 || draft.qty > 999) {
      throw new OrderEditError(
        `bad qty for ${draft.id}: ${draft.qty}`,
        "Each quantity must be between 1 and 999.",
      );
    }

    if (
      !Number.isFinite(draft.unitPrice) ||
      draft.unitPrice < 0 ||
      draft.unitPrice > 1_000_000
    ) {
      throw new OrderEditError(
        `bad unit price for ${draft.id}: ${draft.unitPrice}`,
        "Each rate must be zero or more.",
      );
    }
  }

  const saved: OrderItem[] = [];

  for (const draft of drafts) {
    const { data, error } = await client
      .from("order_items")
      .update({ qty: draft.qty, unit_price: draft.unitPrice })
      .eq("id", draft.id)
      .eq("order_id", orderId)
      .select("*")
      .maybeSingle();

    if (error) throw new Error(error.message);

    if (!data) {
      throw new OrderEditError(
        `line ${draft.id} is not on order ${orderId}`,
        "One of those lines is no longer on this booking.",
      );
    }

    saved.push(data);
  }

  return {
    items: saved,
    total: saved.reduce((sum, item) => sum + item.qty * item.unit_price, 0),
  };
}

// ---------------------------------------------------------------------------
// Convenience
// ---------------------------------------------------------------------------

/** The request-scoped client, already authenticated as whoever is signed in. */
export async function updateOrderItemsForCurrentUser(
  orderId: string,
  drafts: OrderItemDraft[],
): Promise<UpdateItemsResult> {
  return updateOrderItems(await createClient(), orderId, drafts);
}

export async function advanceOrderStatusForCurrentUser(
  input: AdvanceStatusInput,
): Promise<AdvanceStatusResult> {
  return advanceOrderStatus(await createClient(), input);
}

/** Turns a failure into a sentence a page can render. */
export function toOrderEditMessage(error: unknown): string {
  if (error instanceof OrderEditError) return error.userMessage;

  if (error instanceof DomainError) return error.userMessage;

  console.error("Admin booking operation failed", error);

  return "We could not save those changes. Please try again.";
}
