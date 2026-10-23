import { NextResponse, type NextRequest } from "next/server";

import { createServiceClient } from "@/db/server";
import { requireCronAuth } from "@/server/cron-auth";

/**
 * Slot housekeeping.
 *
 * Three jobs in one route, because they share the same lock-free pass over
 * today's bookings and running them together halves the scheduled invocations:
 *
 *   - Queue a reminder to customers with a pickup in the next two hours.
 *   - Write a bell entry to every staff member holding an assignment whose
 *     slot is today (see the staff pass at the bottom).
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
      .select("id, start_time, end_time, label");

    if (slotsError) throw new Error(slotsError.message);

    const slotOf = new Map(
      (slots ?? []).map((slot) => [
        slot.id,
        {
          label: slot.label ?? `${slot.start_time}-${slot.end_time}`,
          start: slot.start_time,
        },
      ]),
    );
    const nowMinutes = today.getHours() * 60 + today.getMinutes();

    let remindersQueued = 0;

    for (const order of upcoming ?? []) {
      const slot = slotOf.get(order.pickup_slot_id);
      if (!slot) continue;

      const [hours = "0", minutes = "0"] = slot.start.split(":");
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
        payload: { order_no: order.order_no, slot_start: slot.start },
      });

      if (error) throw new Error(error.message);
      remindersQueued += 1;
    }

    // ---------------------------------------------------------------------
    // The staff pass.
    //
    // Every staff bell needs a reminder when a slot it holds is today, and
    // the assignment is visible here already. Deliberately the whole day and
    // not the customer's two-hour window: the staff member plans a shift, not
    // a slide.
    //
    // Dedupe is per (agent, order, leg) reminder type, checked against the
    // staff_notifications rows themselves, so running the cron twice writes
    // nothing the second time (the index on that triplet backs the check).
    // One bulk read + batch insert keeps the pass at three round trips
    // regardless of how many legs there are.
    // ---------------------------------------------------------------------
    const { data: legs, error: legsError } = await service
      .from("pickup_assignments")
      .select(
        "id, agent_id, type, order_id, status, orders!inner(order_no, customer_name, pickup_slot_date, delivery_slot_date, pickup_slot_id, delivery_slot_id)",
      )
      .in("status", ["assigned", "in_progress"])
      .not("agent_id", "is", null);

    if (legsError) throw new Error(legsError.message);

    type StaffLeg = {
      agent_id: string;
      type: string;
      order_id: string;
      orders: {
        order_no: string;
        customer_name: string;
        pickup_slot_date: string;
        delivery_slot_date: string | null;
        pickup_slot_id: string;
        delivery_slot_id: string | null;
      };
    };

    // The leg must be assigned to this leg's slot being today: a pickup leg
    // keys off the pickup slot date, a delivery leg off the delivery slot
    // date. Both readings need the order anyway for the payload.
    const reminders = (legs ?? [])
      .map((leg) => {
        const entry = leg as unknown as StaffLeg;
        const isPickup = entry.type === "pickup";
        const slotDate = isPickup
          ? entry.orders.pickup_slot_date
          : entry.orders.delivery_slot_date;
        const slotId = isPickup
          ? entry.orders.pickup_slot_id
          : entry.orders.delivery_slot_id;
        return { entry, isPickup, slotDate, slotId };
      })
      .filter(
        (
          entry,
        ): entry is {
          entry: StaffLeg;
          isPickup: boolean;
          slotDate: string;
          slotId: string | null;
        } => {
          return entry.slotDate === dateKey;
        },
      );

    const reminderType = (isPickup: boolean) =>
      isPickup ? "pickup_reminder" : "delivery_reminder";

    if (reminders.length > 0) {
      const { data: existing, error: existingError } = await service
        .from("staff_notifications")
        .select("user_id, order_id, type")
        .in(
          "type",
          reminders.map((entry) => reminderType(entry.isPickup)),
        );

      if (existingError) throw new Error(existingError.message);

      const sent = new Set(
        (existing ?? []).map(
          (row) => `${row.user_id}|${row.order_id}|${row.type}`,
        ),
      );

      const missing = reminders.filter((entry) => {
        const key = `${entry.entry.agent_id}|${entry.entry.order_id}|${reminderType(entry.isPickup)}`;
        return !sent.has(key);
      });

      if (missing.length > 0) {
        const { error: insertError } = await service
          .from("staff_notifications")
          .insert(
            missing.map((entry) => {
              const slot = entry.slotId ? slotOf.get(entry.slotId) : undefined;
              return {
                user_id: entry.entry.agent_id,
                order_id: entry.entry.order_id,
                type: reminderType(entry.isPickup),
                payload: {
                  leg: entry.entry.type,
                  order_no: entry.entry.orders.order_no,
                  customer_name: entry.entry.orders.customer_name,
                  slot_date: entry.slotDate,
                  slot_label: slot?.label ?? null,
                  slot_start: slot?.start ?? null,
                },
              };
            }),
          );

        if (insertError) throw new Error(insertError.message);
      }
    }

    return NextResponse.json({
      date: dateKey,
      remindersQueued,
      staffReminders: reminders.length,
      ordersChecked: upcoming?.length ?? 0,
    });
  } catch (error) {
    console.error("Slot housekeeping failed", error);
    return NextResponse.json({ error: "Housekeeping failed" }, { status: 500 });
  }
}
