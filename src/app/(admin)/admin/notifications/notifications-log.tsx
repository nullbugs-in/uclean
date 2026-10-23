"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  CheckCheck,
  Hourglass,
  RotateCcw,
  Send,
  TriangleAlert,
} from "lucide-react";

import { StatCard } from "@/components/panel/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  LOG_FILTERS,
  LOG_FILTER_LABEL,
  applyLogFilter,
  countLog,
  type LogFilter,
  type NotificationLogEntry,
} from "@/db/queries/admin-notifications";
import type { NotificationStatus } from "@/db/types";
import { cn, formatDateTime } from "@/lib/utils";

import { retryNotificationAction } from "./actions";

/**
 * The message log (section 8.7): "Message log, delivery status, failures and
 * retries".
 *
 * It leads with the failures. Everything else on this page is bookkeeping -
 * a message that went out is already a customer who knows - while one that
 * exhausted its retries is a customer who does not, and the only place that is
 * visible is here.
 */
export function NotificationsLog({
  entries,
  filter,
}: {
  entries: NotificationLogEntry[];
  filter: LogFilter;
}) {
  const counts = countLog(entries);
  const visible = applyLogFilter(entries, filter);
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);

  function retry(id: number) {
    setNotice(null);

    startTransition(async () => {
      const result = await retryNotificationAction({ id });
      setNotice(result.message);
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Messages"
          value={counts.all}
          hint="In this window"
          icon={Send}
        />
        <StatCard
          label="Failed"
          value={counts.failed}
          hint="Exhausted their retries"
          icon={TriangleAlert}
        />
        <StatCard
          label="Queued"
          value={counts.pending}
          hint="Waiting for the next run"
          icon={Hourglass}
        />
        <StatCard
          label="Delivered"
          value={counts.sent}
          hint="Sent or read"
          icon={CheckCheck}
        />
      </div>

      <nav
        aria-label="Filter messages"
        className="flex flex-wrap items-center gap-2"
      >
        {LOG_FILTERS.map((id) => {
          const active = id === filter;

          return (
            <Link
              key={id}
              href={id === "all" ? "/admin/notifications" : `?filter=${id}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground font-medium"
                  : "border-border hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {LOG_FILTER_LABEL[id]}
              {/* The one warning tint, and only when something actually broke. */}
              {id === "failed" && counts.failed > 0 && !active ? (
                <Badge variant="warning" className="ml-2 align-middle">
                  {counts.failed}
                </Badge>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {notice ? (
        <p className="text-muted-foreground text-sm" aria-live="polite">
          {notice}
        </p>
      ) : null}

      {visible.length === 0 ? (
        <div className="border-border rounded-xl border border-dashed px-6 py-12 text-center">
          <Send className="text-muted-foreground mx-auto size-7" aria-hidden />
          <p className="mt-3 font-medium">
            {entries.length === 0
              ? "No messages have been queued yet."
              : "Nothing matches this filter."}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            {entries.length === 0
              ? "Events queue a row here as they happen, and the cron run drains it."
              : "Try another filter."}
          </p>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Messages</CardTitle>
            <CardDescription>
              Newest first. Failures keep their last error until they are
              requeued.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* "Queued" hides behind sm (the message cell already shows the
                channel there), "To" behind md, so both money-free columns
                stop forcing the phone scroll. */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-left text-xs">
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium">Message</th>
                    <th className="hidden pb-2 font-medium sm:table-cell">
                      Order
                    </th>
                    <th className="hidden pb-2 font-medium md:table-cell">
                      To
                    </th>
                    <th className="hidden pb-2 font-medium md:table-cell">
                      Queued
                    </th>
                    <th className="pb-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(({ notification, label, orderNo }) => (
                    <tr
                      key={notification.id}
                      className="border-border/60 border-b last:border-0"
                    >
                      <td className="py-2 pr-3 align-top whitespace-nowrap">
                        <StatusBadge status={notification.status} />
                      </td>
                      <td className="min-w-24 py-2 pr-3 align-top">
                        {label}
                        <span className="text-muted-foreground ml-2 text-xs">
                          {notification.channel}
                        </span>
                        {notification.attempts > 1 ? (
                          <span className="text-muted-foreground block text-xs tabular-nums">
                            {notification.attempts} of{" "}
                            {notification.max_attempts} attempts
                          </span>
                        ) : null}
                        {notification.status === "failed" &&
                        notification.last_error ? (
                          <span className="text-destructive block max-w-80 truncate text-xs">
                            {notification.last_error}
                          </span>
                        ) : null}
                      </td>
                      <td className="hidden py-2 pr-3 align-top font-mono sm:table-cell">
                        {orderNo ? (
                          <Link
                            href={`/admin/bookings/${notification.order_id}`}
                            className="text-primary underline-offset-4 hover:underline"
                          >
                            {orderNo}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="hidden py-2 pr-3 align-top md:table-cell">
                        {notification.destination ?? "-"}
                      </td>
                      <td className="text-muted-foreground hidden py-2 pr-3 align-top whitespace-nowrap tabular-nums md:table-cell">
                        {formatDateTime(notification.created_at)}
                      </td>
                      <td className="py-2 text-right align-top">
                        {notification.status === "failed" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isPending}
                            onClick={() => retry(notification.id)}
                          >
                            <RotateCcw aria-hidden />
                            Retry now
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** The delivery state, as a badge. */
function StatusBadge({ status }: { status: NotificationStatus }) {
  if (status === "failed") return <Badge variant="destructive">Failed</Badge>;
  if (status === "sending") return <Badge variant="warning">Sending</Badge>;
  if (status === "read") return <Badge variant="success">Read</Badge>;
  if (status === "sent") return <Badge variant="success">Sent</Badge>;

  return <Badge variant="secondary">Queued</Badge>;
}
