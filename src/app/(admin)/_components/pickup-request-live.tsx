"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { RadioTower } from "lucide-react";

import { createClient } from "@/db/client";
import { Button } from "@/components/ui/button";

/**
 * Tells the admin when a customer has booked a pickup.
 *
 * The architecture doc (section 7.1) requires a booking to "appear instantly in
 * the admin and staff dashboards". This subscribes to `orders` and
 * `pickup_assignments` and raises a banner rather than refreshing underneath the
 * admin, because someone part-way through assigning an order should not have the
 * row they are working on swapped out from under them.
 *
 * Realtime delivers rows through the same RLS policies as a normal select, so an
 * admin sees every booking and a customer would only ever see their own. The
 * subscription is keyed on nothing, because the payload's RLS check already
 * scopes it.
 *
 * Both tables must be in the `supabase_realtime` publication, which migration
 * `20260101000010_admin_pickups_realtime.sql` adds. If a deployment predates it,
 * the subscription simply never fires and the page still works on refresh.
 */
export function PickupRequestLive() {
  const router = useRouter();
  const [pending, setPending] = useState(0);
  const [connected, setConnected] = useState(false);
  const channelRef = useRef<ReturnType<
    ReturnType<typeof createClient>["channel"]
  > | null>(null);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel("admin-pickups")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        (payload) => {
          const status = (payload.new as { status?: string }).status;
          // Only a brand new request is worth interrupting for. Every later
          // status change on an order the admin is already looking at is noise.
          if (status === "pickup_requested") setPending((count) => count + 1);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pickup_assignments" },
        () => setPending((count) => count + 1),
      )
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
      });

    channelRef.current = channel;

    return () => {
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, []);

  function refresh() {
    setPending(0);
    router.refresh();
  }

  // Nothing to say when nothing has arrived. `connected` is deliberately not
  // rendered either: a page that is quietly not live should not make the admin
  // distrust the list they are looking at.
  if (pending === 0) return null;

  return (
    <div
      role="status"
      className="border-warning/40 bg-warning/10 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3"
    >
      <p className="flex items-center gap-2 text-sm font-medium">
        <RadioTower
          className="text-muted-foreground size-4"
          aria-hidden="true"
        />
        {pending === 1
          ? "A new pickup request has come in"
          : `${pending} pickup updates have come in`}
        {connected ? "." : " - refresh to check."}
      </p>

      <Button type="button" size="sm" onClick={refresh}>
        Show now
      </Button>
    </div>
  );
}
