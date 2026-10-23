"use server";

import { revalidatePath } from "next/cache";

import type { OrderStatus } from "@/db/types";
import { requireStaff } from "@/server/auth";
import { DomainError } from "@/server/errors";
import { changeOrderStatus } from "@/server/orders";

export type UpdateOrderStatusResult =
  { ok: true } | { ok: false; message: string };

/**
 * Moves an order to the next status from a staff panel card.
 *
 * Authorisation is layered. requireStaff() rejects anyone who is not staff or
 * admin, changeOrderStatus() re-checks the transition against the state
 * machine, and the orders_update_staff_or_owner RLS policy plus the
 * orders_enforce_transition trigger are the final gate, so an agent can only
 * move orders they are assigned against. Nothing but the order id and the
 * target status is trusted from the browser.
 *
 * Errors are returned rather than thrown so the button can render them inline,
 * matching the other actions in the app.
 */
export async function updateOrderStatusAction(
  orderId: string,
  next: OrderStatus,
): Promise<UpdateOrderStatusResult> {
  try {
    await requireStaff();
    await changeOrderStatus(orderId, next);

    revalidatePath("/staff");
    revalidatePath("/staff/orders");
    revalidatePath("/staff/pickups");
    revalidatePath("/staff/deliveries");

    return { ok: true };
  } catch (error) {
    if (error instanceof DomainError) {
      return { ok: false, message: error.userMessage };
    }

    console.error("Staff order status update failed", error);
    return {
      ok: false,
      message: "We could not update the order. Please try again.",
    };
  }
}
