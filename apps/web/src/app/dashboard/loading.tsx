/**
 * Dashboard Home Loading Skeleton
 * Matches layout of /dashboard: greeting, upcoming hero card, 4 stat cards, quick actions, profiles.
 */

export default function DashboardLoading() {
  return (
    <div className="p-6 lg:p-10 max-w-5xl animate-pulse" role="status" aria-live="polite">
      <span className="sr-only">Loading dashboard...</span>
      {/* Greeting Skeleton */}
      <div className="mb-10 space-y-2">
        <div className="h-8 w-64 rounded-md bg-[var(--border)]" />
        <div className="h-4 w-48 rounded-md bg-[var(--border)] opacity-60" />
      </div>

      {/* Next Class Hero Skeleton */}
      <div className="card p-5 mb-8 border border-[var(--border)]">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="space-y-3">
            <div className="h-5 w-20 rounded-full bg-[var(--border)]" />
            <div className="h-6 w-56 rounded-md bg-[var(--border)]" />
            <div className="h-4 w-40 rounded-md bg-[var(--border)] opacity-75" />
            <div className="h-3 w-32 rounded-md bg-[var(--border)] opacity-50" />
          </div>
          <div className="h-11 w-32 rounded-lg bg-[var(--border)]" />
        </div>
      </div>

      {/* Stats Skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card p-4 border border-[var(--border)] space-y-2">
            <div className="h-3 w-16 rounded bg-[var(--border)] opacity-60" />
            <div className="h-7 w-24 rounded bg-[var(--border)]" />
            <div className="h-3 w-20 rounded bg-[var(--border)] opacity-50" />
          </div>
        ))}
      </div>

      {/* Quick Actions Skeleton */}
      <div className="mb-10">
        <div className="h-4 w-28 rounded bg-[var(--border)] opacity-60 mb-4" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-4 border border-[var(--border)] space-y-2">
              <div className="h-4 w-24 rounded bg-[var(--border)]" />
              <div className="h-3 w-28 rounded bg-[var(--border)] opacity-50" />
            </div>
          ))}
        </div>
      </div>

      {/* Profiles Skeleton */}
      <div>
        <div className="h-4 w-32 rounded bg-[var(--border)] opacity-60 mb-4" />
        <div className="grid lg:grid-cols-2 gap-4">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="card p-5 border border-[var(--border)] space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[var(--border)]" />
                  <div className="space-y-1.5">
                    <div className="h-4 w-24 rounded bg-[var(--border)]" />
                    <div className="h-3 w-16 rounded-full bg-[var(--border)] opacity-60" />
                  </div>
                </div>
                <div className="h-4 w-12 rounded bg-[var(--border)]" />
              </div>
              <div className="h-3.5 w-40 rounded bg-[var(--border)] opacity-75" />
              <div className="h-2 w-full rounded-full bg-[var(--border)] opacity-40" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
