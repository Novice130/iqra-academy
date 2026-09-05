/**
 * Teacher & Admin Students Page Loading Skeleton
 * Matches geometry of /dashboard/teacher/students: header with actions and student cards grid.
 */

export default function TeacherStudentsLoading() {
  return (
    <div className="p-6 lg:p-10 max-w-6xl animate-pulse space-y-8" role="status" aria-live="polite">
      <span className="sr-only">Loading students list...</span>
      {/* Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-48 rounded bg-[var(--border)]" />
          <div className="h-4 w-72 rounded bg-[var(--border)] opacity-60" />
        </div>
        <div className="h-10 w-40 rounded-xl bg-[var(--border)]" />
      </div>

      {/* Student Cards Grid */}
      <div className="grid md:grid-cols-2 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[var(--border)]" />
                <div className="space-y-1.5">
                  <div className="h-4 w-32 rounded bg-[var(--border)]" />
                  <div className="h-3 w-24 rounded bg-[var(--border)] opacity-60" />
                </div>
              </div>
              <div className="h-3 w-20 rounded bg-[var(--border)] opacity-50" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="h-4 w-28 rounded bg-[var(--border)]" />
                <div className="h-4 w-10 rounded bg-[var(--border)]" />
              </div>
              <div className="h-2 w-full rounded-full bg-[var(--border)] opacity-40" />
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="h-3 w-36 rounded bg-[var(--border)] opacity-50" />
              <div className="flex items-center gap-2">
                <div className="h-8 w-20 rounded-lg bg-[var(--border)]" />
                <div className="h-8 w-24 rounded-lg bg-[var(--border)]" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
