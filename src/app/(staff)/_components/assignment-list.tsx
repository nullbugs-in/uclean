import Link from "next/link";

import { Button } from "@/components/ui/button";
import { listAssignedOrders } from "@/db/queries/staff";
import { createClient } from "@/db/server";
import type { AssignmentType } from "@/db/types";

import { AssignmentCard } from "./assignment-card";

const EMPTY: Record<AssignmentType, { title: string; body: string }> = {
  pickup: {
    title: "No pickups on the book",
    body: "Today's pickups show up here as soon as an admin assigns them to you.",
  },
  delivery: {
    title: "Nothing going back out",
    body: "Deliveries appear here once an order is ready and you are assigned to take it.",
  },
};

/**
 * The pickup or delivery list for the staff panel.
 *
 * The two lists used to run the same query and render the same rows twice,
 * because the "type" was only ever used to caption the card. The split now
 * happens in `listAssignedOrders`, against the assignment row's own leg and the
 * order states that leg is actually open in.
 *
 * RLS already limits an ordinary agent to orders they hold an assignment
 * against, so there is no client-side role check here to get wrong.
 */
export async function AssignmentList({ type }: { type: AssignmentType }) {
  const supabase = await createClient();
  const rows = await listAssignedOrders(supabase, { type });
  const empty = EMPTY[type];

  if (rows.length === 0) {
    return (
      <div className="border-border rounded-lg border border-dashed px-6 py-12 text-center">
        <p className="font-medium">{empty.title}</p>
        <p className="text-muted-foreground mx-auto mt-1 max-w-md text-sm">
          {empty.body}
        </p>
        <Button asChild size="sm" variant="outline" className="mt-5">
          <Link href="/staff">Back to overview</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {rows.map((row) => (
        <AssignmentCard key={row.order.id} row={row} type={type} />
      ))}
    </div>
  );
}
