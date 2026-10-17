"use server";

import { revalidatePath } from "next/cache";

import {
  walkInLookupSchema,
  walkInRequestSchema,
  type WalkInRequestInput,
} from "@/lib/validation";
import {
  findOrCreateWalkInCustomer,
  lookupWalkInCustomer,
} from "@/server/admin-walk-in";
import { requireAdmin } from "@/server/auth";
import { DomainError } from "@/server/errors";
import { createPickupOrder } from "@/server/orders";

/**
 * Walk-in actions (section 8.11).
 *
 * Both open with `requireAdmin()`. That is the gate for the whole module: it
 * writes a customer account through the service role and then books an order on
 * that customer's behalf, and `createPickupOrder` permits booking for someone
 * else precisely because the caller is staff or admin. There is no RLS policy
 * standing behind this, so the check here is all of it.
 */

export type WalkInActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

export type WalkInLookupOutcome =
  | { status: "new" }
  | { status: "existing"; profileId: string; fullName: string }
  | { status: "staff" };

export type WalkInOrderResult = {
  orderId: string;
  orderNo: string;
  customerName: string;
  /** True when the counter's number was new and an account was created. */
  customerCreated: boolean;
};

/**
 * A walk-in touches the order lists, the pickup board and the sales report, so
 * all of them are refreshed together. Miss one and the counter takes an order
 * that the page behind them insists does not exist.
 */
function revalidateWalkInViews() {
  revalidatePath("/admin/walk-in");
  revalidatePath("/admin/bookings");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/pickups");
  revalidatePath("/admin/sales");
  revalidatePath("/admin");
}

function toMessage(error: unknown): string {
  if (error instanceof DomainError) return error.userMessage;

  console.error("Walk-in action failed", error);
  return "We could not save this walk-in. Please try again shortly.";
}

/**
 * Looks up a number at the counter without writing anything.
 *
 * Lets the form tell the person typing that the number is already Asha Menon, or
 * that it belongs to a colleague, before they have filled in an address and a
 * basket - which is the cheapest moment to notice a wrong digit.
 */
export async function lookupWalkInCustomerAction(input: {
  mobile: string;
}): Promise<WalkInActionResult<WalkInLookupOutcome>> {
  const parsed = walkInLookupSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Enter a valid 10 digit mobile number.",
    };
  }

  try {
    await requireAdmin();

    const result = await lookupWalkInCustomer(parsed.data.mobile);

    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, message: toMessage(error) };
  }
}

/**
 * Takes a counter order.
 *
 * The customer is resolved first, because the order has to belong to somebody:
 * an existing number reuses that profile, a new one gets an account. Only then is
 * the booking made, through the same `createPickupOrder` the website uses, with
 * `source = "walk_in"` and the admin recorded as its author. The slot capacity
 * lock, the blocked-date check and the 6 km zone test therefore all apply to a
 * walk-in in exactly the way they apply online - which is the point of not
 * building a second path.
 *
 * `zoneNoticeAcceptedAt` is the moment the counter ticked the box on the
 * customer's behalf. It is a real acknowledgement made in front of the customer
 * rather than a fabricated one, which is why the form will not submit without it.
 */
export async function createWalkInOrderAction(
  input: WalkInRequestInput,
): Promise<WalkInActionResult<WalkInOrderResult>> {
  const parsed = walkInRequestSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ??
        "Please check the details and try again.",
    };
  }

  try {
    const admin = await requireAdmin();

    const customer = await findOrCreateWalkInCustomer(
      { fullName: parsed.data.fullName, mobile: parsed.data.mobile },
      admin.profile.id,
    );

    const order = await createPickupOrder({
      customerId: customer.profileId,
      address: parsed.data.address,
      lat: parsed.data.lat,
      lng: parsed.data.lng,
      notes: parsed.data.notes || null,
      slotDate: parsed.data.slotDate,
      slotId: parsed.data.slotId,
      zoneNoticeAcceptedAt: parsed.data.zoneNoticeAcceptedAt,
      items: parsed.data.items,
      source: "walk_in",
      createdBy: admin.profile.id,
    });

    revalidateWalkInViews();

    return {
      ok: true,
      data: {
        orderId: order.orderId,
        orderNo: order.orderNo,
        customerName: customer.fullName,
        customerCreated: customer.created,
      },
    };
  } catch (error) {
    return { ok: false, message: toMessage(error) };
  }
}
