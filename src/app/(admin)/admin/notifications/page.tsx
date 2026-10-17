import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PanelPage } from "@/components/panel/panel-page";
import {
  LOG_FILTERS,
  listNotificationLog,
  type LogFilter,
} from "@/db/queries/admin-notifications";
import { createClient } from "@/db/server";
import { requireAdmin } from "@/server/auth";

import { NotificationsLog } from "./notifications-log";

export const metadata: Metadata = { title: "Notifications" };

const TEMPLATES = [
  "otp",
  "order_confirmed",
  "agent_assigned",
  "picked_up",
  "invoice_ready",
  "payment_received",
  "out_for_delivery",
  "delivered",
];

function readFilter(value: string | string[] | undefined): LogFilter {
  const candidate = Array.isArray(value) ? value[0] : value;
  return LOG_FILTERS.includes(candidate as LogFilter)
    ? (candidate as LogFilter)
    : "all";
}

/**
 * Notification log (section 8.7).
 *
 * The queue is already wired: events insert rows via a database trigger, and
 * /api/cron/notifications drains them with retries and exponential backoff. What
 * was missing is the page that answers "did the customer actually get told?" -
 * which is the whole point of the log, since a message that exhausted its
 * retries is invisible everywhere else in the app.
 *
 * SMS is the fallback channel when WhatsApp fails. The cron route requires the
 * CRON_SECRET bearer token, so it is not callable by anyone who finds the URL.
 */
export default async function AdminNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string | string[] }>;
}) {
  await requireAdmin();

  const { filter } = await searchParams;
  const supabase = await createClient();

  const entries = await listNotificationLog(supabase).catch((error: unknown) => {
    console.error("Could not load the message log", error);
    return [];
  });

  return (
    <PanelPage
      title="Notifications"
      description="Message log, delivery status, failures and retries."
    >
      <div className="space-y-6">
        <NotificationsLog entries={entries} filter={readFilter(filter)} />

        {/*
         * The templates are approval state rather than configuration: Meta
         * approves them over days, so applying early is the only thing that
         * shortens the wait. Kept on the page so it is visible where the failures
         * are, which is where an unapproved template shows up first.
         */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Templates to approve with Meta</CardTitle>
            <CardDescription>
              Approval takes several days, so apply before the messages are
              needed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-wrap gap-2">
              {TEMPLATES.map((template) => (
                <li key={template}>
                  <Badge variant="outline">{template}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </PanelPage>
  );
}
