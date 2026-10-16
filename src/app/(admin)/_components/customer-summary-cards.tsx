import { CalendarPlus, UserPlus, Users } from "lucide-react";

import { StatCard } from "@/components/panel/stat-card";
import type { CustomerSummary } from "@/db/queries/admin-customers";

/**
 * The headline customer figures.
 *
 * Every number is a `count(*)` from the database, not a count of the rows on
 * screen, so the figures describe the customer book rather than whatever the
 * admin has searched for — the same rule the bookings summary follows.
 *
 * "New this week" sits beside "new this month" because the pair is the useful
 * one: a month figure on its own cannot separate a steady trickle from a rush
 * that happened three weeks ago.
 */
export function CustomerSummaryCards({ summary }: { summary: CustomerSummary }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <StatCard
        label="Customers"
        value={summary.total}
        hint="Every account, since sign up"
        icon={Users}
      />
      <StatCard
        label="New this month"
        value={summary.newThisMonth}
        hint="Joined in the current calendar month"
        icon={UserPlus}
      />
      <StatCard
        label="New this week"
        value={summary.newThisWeek}
        hint="Joined in the last seven days"
        icon={CalendarPlus}
      />
    </div>
  );
}
