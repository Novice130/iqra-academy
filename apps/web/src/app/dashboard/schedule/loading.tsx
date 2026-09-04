/**
 * Schedule Page Loading Skeleton
 * Matches geometry of /dashboard/schedule: week navigation and 8-column calendar grid.
 */

export default function ScheduleLoading() {
  return (
    <div className="p-6 lg:p-10 max-w-6xl animate-pulse space-y-8">
      {/* Header and Week Navigation */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-32 rounded bg-[var(--border)]" />
          <div className="h-4 w-48 rounded bg-[var(--border)] opacity-60" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-16 rounded-lg bg-[var(--border)]" />
          <div className="h-9 w-16 rounded-lg bg-[var(--border)]" />
          <div className="h-9 w-16 rounded-lg bg-[var(--border)]" />
        </div>
      </div>

      {/* Calendar Grid Skeleton */}
      <div className="card rounded-2xl border border-[var(--border)] overflow-hidden bg-[var(--bg-elevated)]">
        {/* Day Column Headers */}
        <div className="grid grid-cols-8 border-b border-[var(--border)] p-3 text-center">
          <div className="h-4 w-8 mx-auto rounded bg-[var(--border)] opacity-40" />
          {[...Array(7)].map((_, i) => (
            <div key={i} className="h-4 w-12 mx-auto rounded bg-[var(--border)]" />
          ))}
        </div>

        {/* Hourly Rows */}
        <div className="divide-y divide-[var(--border)]">
          {[...Array(8)].map((_, r) => (
            <div key={r} className="grid grid-cols-8 h-16 items-center">
              <div className="h-3 w-10 mx-auto rounded bg-[var(--border)] opacity-50" />
              {[...Array(7)].map((_, c) => (
                <div key={c} className="h-full border-l border-[var(--border)] p-1.5">
                  {r % 3 === 1 && c % 2 === 0 && (
                    <div className="h-full rounded-md bg-[var(--border)] opacity-40" />
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
