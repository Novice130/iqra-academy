/**
 * Booking Page Loading Skeleton
 * Matches geometry of /dashboard/booking: header, teacher selection chips, day selector, and slot grid.
 */

export default function BookingLoading() {
  return (
    <div className="p-6 sm:p-8 max-w-[760px] mx-auto animate-pulse space-y-5" role="status" aria-live="polite">
      <span className="sr-only">Loading booking calendar...</span>
      {/* Title Skeleton */}
      <div className="space-y-2">
        <div className="h-7 w-52 rounded bg-[var(--border)]" />
        <div className="h-4 w-72 rounded bg-[var(--border)] opacity-60" />
      </div>

      {/* Section 1: Choose teacher */}
      <section className="card p-5 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] space-y-4">
        <div className="h-4 w-36 rounded bg-[var(--border)]" />
        <div className="flex gap-2.5 flex-wrap">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-10 w-32 rounded-xl bg-[var(--border)]" />
          ))}
        </div>
      </section>

      {/* Section 2: Pick time */}
      <section className="card p-5 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] space-y-4">
        <div className="h-4 w-28 rounded bg-[var(--border)]" />

        {/* Days horizontal scroll strip */}
        <div className="flex gap-2 pb-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-14 w-24 rounded-xl bg-[var(--border)] shrink-0" />
          ))}
        </div>

        {/* Slot pills grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 pt-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-12 rounded-xl bg-[var(--border)]" />
          ))}
        </div>
      </section>
    </div>
  );
}
