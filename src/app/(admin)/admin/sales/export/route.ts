import {
  PERIODS,
  buildSales,
  buildSalesCsv,
  type SalesPeriodId,
} from "@/db/queries/admin-sales";
import { createClient } from "@/db/server";
import { requireAdmin } from "@/server/auth";
import { toDateKey } from "@/lib/dates";

/**
 * The CSV export for the sales report (section 8.9).
 *
 * A route rather than a server action because the result is a file, not a page
 * state: it has to arrive as a download with its own content type, which a
 * response from an action cannot carry without the client reassembling the blob
 * by hand.
 *
 * The session is checked here as well as in the middleware, because this response
 * is readable by anyone who can reach the URL and a redirect is not a defence for
 * something that returns a file. An admin cannot fetch someone else's report - it
 * only ever describes the whole store - but they should not be able to fetch it
 * unauthenticated at all.
 */
export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const url = new URL(request.url);
  const raw = url.searchParams.get("period") ?? "all";

  /*
   * Anything unknown falls back to "all" rather than erroring, so a mistyped
   * period in a bookmark still exports something sensible. The window is
   * re-derived from today's date on purpose rather than taken from the query
   * string: the client should not be able to name the range the report reads,
   * and there is no reason for it to want to.
   */
  const period = (PERIODS as readonly string[]).includes(raw)
    ? (raw as SalesPeriodId)
    : "all";

  const todayKey = toDateKey(new Date());

  try {
    const supabase = await createClient();
    const report = await buildSales(supabase, period, todayKey);

    return new Response(buildSalesCsv(report), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="sales-${period}-${todayKey}.csv"`,
      },
    });
  } catch (error) {
    console.error("Could not build the sales export", error);
    return new Response("Could not build the report.", { status: 500 });
  }
}
