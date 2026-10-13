import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { listActiveTimeSlots } from "@/db/queries/catalog";
import { createClient } from "@/db/server";

export async function TimeSlotTable() {
  const supabase = await createClient();
  const slots = await listActiveTimeSlots(supabase).catch(() => []);

  if (slots.length === 0) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">
        No slots defined. Run the seed, or add them here.
      </p>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left">
              <th className="p-3 font-medium">Slot</th>
              <th className="p-3 font-medium">Capacity</th>
              <th className="p-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {slots.map((slot) => (
              <tr
                key={slot.id}
                className="border-b border-[var(--border)] last:border-0"
              >
                <td className="p-3">
                  {slot.label ?? `${slot.start_time} to ${slot.end_time}`}
                </td>
                <td className="p-3">{slot.capacity}</td>
                <td className="p-3">
                  {slot.capacity === 0 ? (
                    <Badge variant="warning">Not configured</Badge>
                  ) : (
                    <Badge variant="success">Bookable</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
