import { NextResponse, type NextRequest } from "next/server";

import { requireCronAuth } from "@/server/cron-auth";
import { processNotificationQueue } from "@/server/notifications";

/**
 * Drains the notification queue.
 *
 * Scheduled via Vercel Cron. Requires the CRON_SECRET bearer token, because a
 * cron endpoint is otherwise a public URL anyone could hammer.
 */
export async function GET(request: NextRequest) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const results = await processNotificationQueue();
    const sent = results.filter((r) => r.status === "sent").length;
    const failed = results.filter((r) => r.status === "failed").length;

    return NextResponse.json({
      processed: results.length,
      sent,
      failed,
      results,
    });
  } catch (error) {
    console.error("Notification queue run failed", error);
    return NextResponse.json({ error: "Queue run failed" }, { status: 500 });
  }
}
