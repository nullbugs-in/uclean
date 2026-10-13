import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { listCustomers } from "@/db/queries/profiles";
import { createClient } from "@/db/server";
import { formatDate } from "@/lib/utils";

export async function CustomerTable() {
  const supabase = await createClient();
  const customers = await listCustomers(supabase, { limit: 50 }).catch(
    () => [],
  );

  if (customers.length === 0) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">
        No customers yet. They appear here automatically on first sign in.
      </p>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left">
              <th className="p-3 font-medium">Name</th>
              <th className="p-3 font-medium">Mobile</th>
              <th className="p-3 font-medium">WhatsApp</th>
              <th className="p-3 font-medium">Joined</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr
                key={customer.id}
                className="border-b border-[var(--border)] last:border-0"
              >
                <td className="p-3">{customer.full_name}</td>
                <td className="p-3">{customer.mobile}</td>
                <td className="p-3">
                  {customer.whatsapp_number ? (
                    customer.whatsapp_number
                  ) : (
                    <Badge variant="secondary">Not set</Badge>
                  )}
                </td>
                <td className="p-3 text-[var(--muted-foreground)]">
                  {formatDate(customer.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
