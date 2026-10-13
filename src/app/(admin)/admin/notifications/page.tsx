import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/placeholder";

export const metadata: Metadata = { title: "Notifications" };

/**
 * Notification log (section 8.7).
 *
 * The queue is already wired: events insert rows via a database trigger, and
 * /api/cron/notifications drains them with retries and backoff. The Meta
 * template approval mentioned in section 13 takes several days, so apply for
 * those templates early.
 */
export default function AdminNotificationsPage() {
  const templates = [
    "otp",
    "order_confirmed",
    "agent_assigned",
    "picked_up",
    "invoice_ready",
    "payment_received",
    "out_for_delivery",
    "delivered",
  ];

  return (
    <PagePlaceholder
      title="Notifications"
      description="Message log, delivery status, failures and retries."
      milestone="Milestone 6"
    >
      <div>
        <p className="mb-3 text-sm font-medium">
          Templates to approve with Meta
        </p>
        <ul className="flex flex-wrap gap-2">
          {templates.map((template) => (
            <li
              key={template}
              className="rounded-full border border-[var(--border)] px-3 py-1 text-xs"
            >
              {template}
            </li>
          ))}
        </ul>
      </div>
      <p className="text-sm text-[var(--muted-foreground)]">
        SMS is the fallback channel when WhatsApp fails. The cron route requires
        the CRON_SECRET bearer token, so it is not callable by anyone who finds
        the URL.
      </p>
    </PagePlaceholder>
  );
}
