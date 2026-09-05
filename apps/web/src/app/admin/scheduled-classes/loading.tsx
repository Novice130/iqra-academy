/**
 * Admin Scheduled Classes Loading Skeleton
 * Matches geometry of /admin/scheduled-classes: filters bar and table rows.
 */

export default function ScheduledClassesLoading() {
  return (
    <div className="space-y-6 animate-pulse" role="status" aria-live="polite">
      <span className="sr-only">Loading scheduled classes...</span>
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

      {/* Filter Bar Skeleton */}
      <div className="p-4 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="space-y-1">
              <div className="h-3 w-16 rounded bg-[var(--border)] opacity-60" />
              <div className="h-9 w-full rounded-xl bg-[var(--border)]" />
            </div>
          ))}
        </div>
      </div>

      {/* Table Skeleton */}
      <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] overflow-hidden">
        <div className="grid grid-cols-6 p-4 border-b border-[var(--border)] bg-[var(--bg-secondary)]/50">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-3.5 w-20 rounded bg-[var(--border)] opacity-60" />
          ))}
        </div>

        <div className="divide-y divide-[var(--border)]">
          {[...Array(8)].map((_, r) => (
            <div key={r} className="grid grid-cols-6 p-4 items-center">
              <div className="h-4 w-32 rounded bg-[var(--border)]" />
              <div className="h-4 w-28 rounded bg-[var(--border)]" />
              <div className="h-4 w-24 rounded bg-[var(--border)] opacity-80" />
              <div className="h-5 w-20 rounded-md bg-[var(--border)]" />
              <div className="h-5 w-16 rounded-md bg-[var(--border)]" />
              <div className="h-8 w-24 rounded-lg bg-[var(--border)] justify-self-end" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
