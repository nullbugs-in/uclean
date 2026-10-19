import { Skeleton } from "@/components/ui/skeleton";

import { PanelPage } from "@/components/panel/panel-page";

/**
 * Skeleton for the admin dashboard while live data loads.
 */
export default function AdminDashboardLoading() {
  return (
    <PanelPage
      title="Dashboard"
      description="Loading today's figures and trends..."
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={`stat-${index}`}
            className="border-border bg-card flex flex-col gap-3 rounded-xl border py-4"
          >
            <div className="flex items-center justify-between px-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="size-7 rounded-md" />
            </div>
            <div className="space-y-2 px-4">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-3 w-36" />
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="border-border bg-card flex flex-col gap-3 rounded-xl border py-4 lg:col-span-2">
          <div className="space-y-2 px-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-56" />
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
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={`legend-${index}`} className="h-3 w-full" />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="border-border bg-card flex flex-col gap-4 rounded-xl border py-4">
        <div className="space-y-2 px-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-48" />
        </div>
        <div className="space-y-3 px-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      </div>
    </PanelPage>
  );
}
