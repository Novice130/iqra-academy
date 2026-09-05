/**
 * Admin Teacher Schedules Loading Skeleton
 * Matches geometry of /admin/teacher-schedules: week navigation bar and dense table rows.
 */

export default function TeacherSchedulesLoading() {
  return (
    <div className="space-y-6 animate-pulse" role="status" aria-live="polite">
      <span className="sr-only">Loading teacher schedules...</span>
      {/* Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[var(--border)]">
        <div className="space-y-2">
          <div className="h-3.5 w-32 rounded bg-[var(--border)] opacity-60" />
          <div className="h-7 w-64 rounded bg-[var(--border)]" />
          <div className="h-4 w-96 rounded bg-[var(--border)] opacity-60" />
        </div>
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-36 rounded-xl bg-[var(--border)]" />
          <div className="h-9 w-36 rounded-xl bg-[var(--border)]" />
        </div>
      </div>

      {/* Week Navigation Skeleton */}
      <div className="p-4 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-24 rounded-lg bg-[var(--border)]" />
          <div className="h-8 w-20 rounded-lg bg-[var(--border)]" />
          <div className="h-8 w-24 rounded-lg bg-[var(--border)]" />
        </div>
        <div className="h-8 w-48 rounded-xl bg-[var(--border)]" />
      </div>

      {/* Spreadsheet Skeleton */}
      <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-8 p-4 border-b border-[var(--border)] bg-[var(--bg-secondary)]/50">
          <div className="h-4 w-28 rounded bg-[var(--border)]" />
          {[...Array(7)].map((_, i) => (
            <div key={i} className="h-4 w-16 mx-auto rounded bg-[var(--border)] opacity-70" />
          ))}
        </div>

        {/* Rows */}
        <div className="divide-y divide-[var(--border)]">
          {[...Array(5)].map((_, r) => (
            <div key={r} className="grid grid-cols-8 h-28 items-center p-3">
              <div className="space-y-2 pr-2 border-r border-[var(--border)] h-full flex flex-col justify-center">
                <div className="h-4 w-32 rounded bg-[var(--border)]" />
                <div className="h-3 w-24 rounded bg-[var(--border)] opacity-60" />
                <div className="h-4 w-16 rounded bg-[var(--border)] opacity-50" />
              </div>
              {[...Array(7)].map((_, c) => (
                <div key={c} className="h-full border-r border-[var(--border)] last:border-0 p-2 flex flex-col justify-center">
                  {(r + c) % 3 === 0 ? (
                    <div className="h-14 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-2 space-y-1">
                      <div className="h-3 w-3/4 rounded bg-[var(--border)]" />
                      <div className="h-2 w-1/2 rounded bg-[var(--border)] opacity-60" />
                    </div>
                  ) : (r + c) % 4 === 0 ? (
                    <div className="h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 p-1.5">
                      <div className="h-2 w-12 rounded bg-[var(--border)]" />
                    </div>
                  ) : (
                    <div className="h-8 rounded-lg border border-dashed border-[var(--border)] opacity-40" />
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
