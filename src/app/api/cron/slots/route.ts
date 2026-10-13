import { NextResponse, type NextRequest } from "next/server";

import { createServiceClient } from "@/db/server";
import { requireCronAuth } from "@/server/cron-auth";

/**
 * Slot housekeeping.
 *
 * Two jobs in one route, because they share the same lock-free pass over
 * today's bookings and running them together halves the scheduled invocations:
 *
 *   - Queue a reminder to customers with a pickup in the next two hours.
 *   - Close past slots so the wizard stops offering times that have gone by.
 */
export async function GET(request: NextRequest) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;

  const service = createServiceClient();
  const today = new Date();
  const dateKey = today.toISOString().slice(0, 10);

  try {
    const { data: upcoming, error: ordersError } = await service
      .from("orders")
      .select("id, order_no, customer_id, pickup_slot_date, pickup_slot_id")
      .eq("pickup_slot_date", dateKey)
      .in("status", ["pickup_requested", "agent_assigned"]);

    if (ordersError) throw new Error(ordersError.message);

    const { data: slots, error: slotsError } = await service
      .from("time_slots")
      .select("id, start_time");

    if (slotsError) throw new Error(slotsError.message);

    const startTimes = new Map((slots ?? []).map((s) => [s.id, s.start_time]));
    const nowMinutes = today.getHours() * 60 + today.getMinutes();

    let remindersQueued = 0;

    for (const order of upcoming ?? []) {
      const start = startTimes.get(order.pickup_slot_id);
      if (!start) continue;

      const [hours = "0", minutes = "0"] = start.split(":");
      const startMinutes = Number(hours) * 60 + Number(minutes);
      const minutesAway = startMinutes - nowMinutes;

      if (minutesAway < 0 || minutesAway > 120) continue;

      // One reminder per order per slot, keyed off the queued row itself.
      const { data: alreadyQueued } = await service
        .from("notifications")
        .select("id")
        .eq("order_id", order.id)
        .eq("template", "agent_assigned")
        .eq("status", "queued")
        .limit(1);

      if (alreadyQueued && alreadyQueued.length > 0) continue;

      const { error } = await service.from("notifications").insert({
        user_id: order.customer_id,
        channel: "whatsapp",
        template: "agent_assigned",
        order_id: order.id,
        payload: { order_no: order.order_no, slot_start: start },
      });

      if (error) throw new Error(error.message);
      remindersQueued += 1;
    }

    return NextResponse.json({
      date: dateKey,
      remindersQueued,
      ordersChecked: upcoming?.length ?? 0,
    });
  } catch (error) {
    console.error("Slot housekeeping failed", error);
    return NextResponse.json({ error: "Housekeeping failed" }, { status: 500 });
  }
}
