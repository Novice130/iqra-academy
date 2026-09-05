/**
 * Admin Live Classes Loading Skeleton
 * Matches geometry of /admin/live-classes: header with breadcrumbs and live class cards.
 */

export default function LiveClassesLoading() {
  return (
    <div className="space-y-6 animate-pulse" role="status" aria-live="polite">
      <span className="sr-only">Loading live classes...</span>
      {/* Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[var(--border)]">
        <div className="space-y-2">
          <div className="h-3.5 w-32 rounded bg-[var(--border)] opacity-60" />
          <div className="h-7 w-64 rounded bg-[var(--border)]" />
          <div className="h-4 w-96 rounded bg-[var(--border)] opacity-60" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-9 w-36 rounded-xl bg-[var(--border)]" />
          <div className="h-9 w-36 rounded-xl bg-[var(--border)]" />
        </div>
      </div>

      {/* Live Class Cards Skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="p-6 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] space-y-5"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="space-y-1.5 w-3/4">
                  <div className="h-5 w-40 rounded bg-[var(--border)]" />
                  <div className="h-3.5 w-28 rounded bg-[var(--border)] opacity-60" />
                </div>
                <div className="h-5 w-16 rounded-full bg-[var(--border)]" />
              </div>

              <div className="p-3 rounded-xl bg-[var(--bg-secondary)] space-y-2">
                <div className="h-3 w-full rounded bg-[var(--border)] opacity-70" />
                <div className="h-3 w-3/4 rounded bg-[var(--border)] opacity-70" />
                <div className="h-3 w-1/2 rounded bg-[var(--border)] opacity-70" />
              </div>

              <div className="h-4 w-36 rounded bg-[var(--border)] opacity-60" />
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-[var(--border)]">
              <div className="h-8 w-28 rounded-lg bg-[var(--border)]" />
              <div className="h-8 w-20 rounded-lg bg-[var(--border)]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
