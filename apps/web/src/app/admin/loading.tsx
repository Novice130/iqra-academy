/**
 * Admin Panel Loading Skeleton
 * Matches geometry of /admin: header + quick action pills, 6 stat cards, live classes monitor, and scheduled classes matrix.
 */

export default function AdminLoading() {
  return (
    <div className="space-y-8 animate-pulse">
      {/* Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[var(--border)]">
        <div className="space-y-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[var(--border)]" />
            <div className="h-7 w-48 rounded-md bg-[var(--border)]" />
            <div className="h-5 w-14 rounded-full bg-[var(--border)] opacity-60" />
          </div>
          <div className="h-4 w-72 rounded bg-[var(--border)] opacity-60" />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="h-9 w-44 rounded-xl bg-[var(--border)]" />
          <div className="h-9 w-44 rounded-xl bg-[var(--border)] opacity-75" />
          <div className="h-9 w-28 rounded-xl bg-[var(--border)] opacity-75" />
          <div className="h-9 w-32 rounded-xl bg-[var(--border)] opacity-75" />
        </div>
      </div>

      {/* 6 Stat Cards Skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] flex flex-col justify-between h-24"
          >
            <div className="h-7 w-16 rounded bg-[var(--border)]" />
            <div className="h-4 w-20 rounded bg-[var(--border)] opacity-60" />
          </div>
        ))}
      </div>

      {/* Live Classes Monitor Skeleton */}
      <section className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-[var(--border)]" />
            <div className="h-5 w-36 rounded bg-[var(--border)]" />
          </div>
          <div className="h-4 w-28 rounded bg-[var(--border)] opacity-60" />
        </div>
        <div className="p-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] space-y-3"
              >
                <div className="space-y-1.5">
                  <div className="h-4 w-3/4 rounded bg-[var(--border)]" />
                  <div className="h-3 w-1/2 rounded bg-[var(--border)] opacity-60" />
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
                  <div className="h-4 w-16 rounded bg-[var(--border)]" />
                  <div className="h-4 w-20 rounded bg-[var(--border)] opacity-75" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Scheduled Classes Matrix Skeleton */}
      <section className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-5 w-48 rounded bg-[var(--border)]" />
          <div className="h-8 w-64 rounded-lg bg-[var(--border)]" />
        </div>
        <div className="h-64 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)]" />
      </section>
    </div>
  );
}
