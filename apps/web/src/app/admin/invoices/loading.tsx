/**
 * Admin Invoices Loading Skeleton
 * Matches geometry of /admin/invoices: breadcrumbs, title, header action, and invoice desk table.
 */

export default function InvoicesLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[var(--border)]">
        <div className="space-y-2">
          <div className="h-3.5 w-36 rounded bg-[var(--border)] opacity-60" />
          <div className="h-7 w-60 rounded bg-[var(--border)]" />
          <div className="h-4 w-96 rounded bg-[var(--border)] opacity-60" />
        </div>
        <div className="h-9 w-36 rounded-xl bg-[var(--border)]" />
      </div>

      {/* Invoice Desk Skeleton */}
      <div className="p-6 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] space-y-6">
        {/* Top controls / actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="h-10 w-64 rounded-xl bg-[var(--border)]" />
          <div className="h-10 w-44 rounded-xl bg-[var(--border)]" />
        </div>

        {/* Invoices table skeleton */}
        <div className="rounded-xl border border-[var(--border)] overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-6 p-4 border-b border-[var(--border)] bg-[var(--bg-secondary)]">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-3.5 w-20 rounded bg-[var(--border)] opacity-70" />
            ))}
          </div>

          {/* Table rows */}
          <div className="divide-y divide-[var(--border)]">
            {[...Array(6)].map((_, r) => (
              <div key={r} className="grid grid-cols-6 p-4 items-center">
                <div className="h-4 w-28 rounded bg-[var(--border)]" />
                <div className="h-4 w-20 rounded bg-[var(--border)] opacity-80" />
                <div className="h-4 w-16 rounded bg-[var(--border)] opacity-60" />
                <div className="h-6 w-20 rounded-full bg-[var(--border)]" />
                <div className="h-4 w-24 rounded bg-[var(--border)] opacity-60" />
                <div className="h-8 w-20 rounded-lg bg-[var(--border)] justify-self-end" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
