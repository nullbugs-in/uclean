import { Card, CardContent } from "@/components/ui/card";
import { listActiveServices } from "@/db/queries/catalog";
import { createClient } from "@/db/server";
import { formatINR } from "@/lib/utils";

export async function ServiceTable() {
  const supabase = await createClient();
  const services = await listActiveServices(supabase).catch(() => []);

  if (services.length === 0) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">
        No services published. Run the seed to load the sample price list.
      </p>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left">
              <th className="p-3 font-medium">Service</th>
              <th className="p-3 font-medium">Unit</th>
              <th className="p-3 font-medium">Price</th>
            </tr>
          </thead>
          <tbody>
            {services.map((service) => (
              <tr
                key={service.id}
                className="border-b border-[var(--border)] last:border-0"
              >
                <td className="p-3">{service.name}</td>
                <td className="p-3 text-[var(--muted-foreground)]">
                  {service.unit}
                </td>
                <td className="p-3 font-medium">{formatINR(service.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
