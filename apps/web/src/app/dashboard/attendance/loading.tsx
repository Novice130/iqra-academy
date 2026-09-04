/**
 * Attendance Page Loading Skeleton
 * Matches geometry of /dashboard/attendance: header with date/teacher dropdowns and grouped class attendance tables.
 */

export default function AttendanceLoading() {
  return (
    <div className="p-6 lg:p-10 max-w-5xl animate-pulse space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div className="space-y-2">
          <div className="h-7 w-36 rounded bg-[var(--border)]" />
          <div className="h-4 w-72 rounded bg-[var(--border)] opacity-60" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="h-9 w-32 rounded-lg bg-[var(--border)]" />
          <div className="h-9 w-32 rounded-lg bg-[var(--border)]" />
          <div className="h-9 w-28 rounded-lg bg-[var(--border)]" />
        </div>
      </div>

      {/* Attendance Day Groups Skeleton */}
      <div className="flex flex-col gap-6">
        {[...Array(2)].map((_, i) => (
          <section key={i} className="card rounded-2xl border border-[var(--border)] overflow-hidden bg-[var(--bg-elevated)]">
            <div className="p-5 border-b border-[var(--border)]">
              <div className="h-4 w-40 rounded bg-[var(--border)] opacity-60" />
            </div>

            {/* Class tables inside day */}
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
                <div className="space-y-1.5">
                  <div className="h-5 w-48 rounded bg-[var(--border)]" />
                  <div className="h-3.5 w-32 rounded bg-[var(--border)] opacity-60" />
                </div>
                <div className="h-6 w-20 rounded-full bg-[var(--border)]" />
              </div>

              {/* Table rows */}
              <div className="space-y-2">
                {[...Array(3)].map((_, r) => (
                  <div key={r} className="flex items-center justify-between py-2 border-b border-[var(--border)]/40 last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[var(--border)]" />
                      <div className="h-4 w-28 rounded bg-[var(--border)]" />
                    </div>
                    <div className="flex gap-4 items-center">
                      <div className="h-4 w-20 rounded bg-[var(--border)] opacity-60" />
                      <div className="h-4 w-16 rounded bg-[var(--border)] opacity-60" />
                      <div className="h-6 w-16 rounded-full bg-[var(--border)]" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
