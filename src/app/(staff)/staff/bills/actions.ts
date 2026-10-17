"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireStaff } from "@/server/auth";
import { BillingError, recordCashOnDelivery } from "@/server/billing";
import { DomainError } from "@/server/errors";

/**
 * Staff billing action.
 *
 * One action only: recording that the cash was collected on delivery.
 *
 * The database is what makes this narrow, not this file. `payments` has an
 * insert policy for assigned staff (`payments_insert_staff_or_admin`), but
 * `invoices` has none - so a staff member can record the payment and cannot
 * rewrite the bill. `recordCashOnDelivery` reads and inserts the payment as the
 * signed-in user, which is what makes `collected_by` honest, and then applies the
 * paid status with the service role, which is the one write the staff policy
 * forbids.
 *
 * `requireStaff()` is still here. It is the check that names the panel, and it
 * costs a single query.
 */

export type StaffBillActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

const codSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.coerce.number().positive("Enter the amount collected"),
});

/** Records Cash on Delivery on a staff member's own order (section 6.4). */
export async function recordCodCollectedAction(input: {
  invoiceId: string;
  amount: number;
}): Promise<StaffBillActionResult> {
  const parsed = codSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Enter the amount collected.",
    };
  }

  try {
    const staff = await requireStaff();

    await recordCashOnDelivery(
      parsed.data.invoiceId,
      parsed.data.amount,
      staff.profile.id,
    );

    revalidatePath("/staff/bills");
    revalidatePath("/admin/billing");
    revalidatePath("/admin");

    return {
      ok: true,
      message: "Cash on delivery recorded. The bill is marked paid.",
    };
  } catch (error) {
    if (error instanceof BillingError || error instanceof DomainError) {
      return { ok: false, message: error.userMessage };
    }

    console.error("Could not record the cash on delivery", error);
    return {
      ok: false,
      message: "We could not record the payment. Please try again.",
    };
  }
}
