import { Skeleton } from "@/components/ui/skeleton";

/**
 * Route-group loading skeleton — renders instantly on navigation while the
 * server component streams, so view switches feel immediate instead of blank.
 * Mirrors the Home layout: briefing banner, metrics row, two-column widgets.
 */
export default function Loading() {
  return (
    <div className="space-y-4 p-4 sm:p-6">
      {/* greeting + briefing banner */}
      <div className="space-y-2 rounded-xl border border-[var(--border)] p-4">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-3.5 w-72" />
        <Skeleton className="h-3.5 w-64" />
      </div>

      {/* metrics row */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-md bg-surface p-2.5">
            <Skeleton className="h-6 w-10 bg-[var(--border)]" />
            <Skeleton className="h-3 w-20 bg-[var(--border)]" />
          </div>
        ))}
      </div>

      {/* widget grid */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-xl border border-[var(--border)] p-4">
            <Skeleton className="h-4 w-32" />
            <div className="space-y-2">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-5/6" />
              <Skeleton className="h-3.5 w-4/6" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
