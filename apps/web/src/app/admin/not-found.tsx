import Link from "next/link";

export default function AdminNotFound() {
  return (
    <div className="py-16 text-center space-y-4">
      <div className="text-4xl">🔍</div>
      <h2 className="text-2xl font-bold text-[var(--text-primary)]">Admin Page Not Found</h2>
      <p className="text-sm text-[var(--text-secondary)] max-w-md mx-auto">
        The administration page you requested does not exist or has been relocated in the system.
      </p>
      <div className="pt-2 flex items-center justify-center gap-3">
        <Link
          href="/admin"
          className="px-4 py-2 rounded-xl text-sm font-semibold bg-[var(--accent)] text-white shadow-sm hover:opacity-95 transition"
        >
          Return to Admin Overview
        </Link>
        <Link
          href="/dashboard"
          className="px-4 py-2 rounded-xl text-sm font-semibold bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border)] hover:bg-[var(--bg-secondary)] transition"
        >
          Dashboard Home
        </Link>
      </div>
    </div>
  );
}
