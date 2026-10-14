"use server";

import { redirect } from "next/navigation";

import { createPickupOrder } from "@/server/orders";
import {
  createPickupSchema,
  zoneNoticeSchema,
} from "@/lib/validation/booking";

import { getAuthUser } from "./_helpers";

type FormState = {
  error?: string;
  success?: boolean;
};

export async function startBooking(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await getAuthUser();
  if (!user) return { error: "Sign in to continue." };

  const notice = zoneNoticeSchema.safeParse({
    accepted: formData.get("zoneNoticeAccepted") === "on",
    acceptedAt: formData.get("zoneNoticeAcceptedAt"),
  });
  if (!notice.success || !notice.data.acceptedAt) {
    return { error: "Please accept the delivery zone notice to continue." };
  }

  const parsed = createPickupSchema.safeParse({
    customerId: user.id,
    address: formData.get("address"),
    lat: formData.get("lat"),
    lng: formData.get("lng"),
    whatsappNumber: formData.get("whatsappNumber"),
    notes: formData.get("notes"),
    slotDate: formData.get("slotDate"),
    slotId: formData.get("slotId"),
    zoneNoticeAcceptedAt: notice.data.acceptedAt,
  });

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { error: first?.message ?? "Invalid pickup details." };
  }

  try {
    const result = await createPickupOrder(parsed.data);
    redirect(`/account/orders/${result.orderId}`);
  } catch (err) {
    if (err instanceof Error) {
      return { error: err.message };
    }
    return { error: "Something went wrong. Please try again." };
  }
}
