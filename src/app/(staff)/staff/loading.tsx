import { Skeleton } from "@/components/ui/skeleton";

import { PanelPage } from "@/components/panel/panel-page";

/**
 * Skeleton for the staff overview while the live data loads.
 *
 * Shows the same structure as the page (stat cards, charts, stops) without any
 * dynamic values to avoid layout shift the moment the results arrive.
 */
export default function StaffOverviewLoading() {
  return (
    <PanelPage
      title="Your round today"
      description="Loading today's schedule..."
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={`stat-${index}`}
            className="border-border bg-card flex flex-col gap-3 rounded-xl border py-4"
          >
            <div className="flex items-center justify-between px-4">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="size-7 rounded-md" />
            </div>
            <div className="space-y-2 px-4">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-3 w-28" />
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="border-border bg-card flex flex-col gap-3 rounded-xl border py-4 lg:col-span-2">
          <div className="space-y-2 px-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-40" />
          </div>
          <div className="px-4 pt-2">
            <Skeleton className="h-[240px] w-full" />
          </div>
        </div>

        <div className="border-border bg-card flex flex-col gap-3 rounded-xl border py-4">
          <div className="space-y-2 px-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-40" />
          </div>
          <div className="flex flex-col items-center gap-4 px-4 pt-2">
            <Skeleton className="h-[200px] w-[200px] rounded-full" />
            <div className="w-full space-y-2">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={`legend-${index}`} className="h-3 w-full" />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="border-border bg-card flex flex-col gap-4 rounded-xl border py-4">
        <div className="space-y-2 px-4">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-3 w-48" />
        </div>
        <div className="grid gap-3 px-4 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={`stop-${index}`}
              className="border-border rounded-lg border p-4"
            >
              <div className="flex items-start justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-16 rounded-full" />
              </div>
              <div className="mt-3 space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-3 w-full" />
              </div>
              <Skeleton className="mt-3 h-1.5 w-full rounded-full" />
              <div className="mt-4 flex gap-2">
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-8 w-20" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </PanelPage>
  );
}
