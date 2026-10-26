/**
 * @fileoverview Previous/next pager for the client-filtered admin tables
 * (students, trials). Server-safe markup; the caller owns the page state.
 */

import { btn } from "../_components/ui";

export const PAGE_SIZE = 25;

export default function Pagination({
  page,
  total,
  onPage,
  noun,
}: {
  /** Zero-based. */
  page: number;
  total: number;
  onPage: (page: number) => void;
  noun: string;
}) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const first = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const last = Math.min(total, (page + 1) * PAGE_SIZE);
  return (
    <nav
      aria-label={`${noun} pages`}
      className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between border-t border-[var(--border)] text-xs text-[var(--text-secondary)]"
    >
      <span aria-live="polite">
        {total === 0 ? `No ${noun}` : `${first}–${last} of ${total} ${noun}`}
      </span>
      <div className="flex items-center gap-2">
        <button type="button" className={btn.ghost} onClick={() => onPage(page - 1)} disabled={page <= 0}>
          Previous
        </button>
        <span className="tabular-nums">
          Page {page + 1} of {pages}
        </span>
        <button type="button" className={btn.ghost} onClick={() => onPage(page + 1)} disabled={page >= pages - 1}>
          Next
        </button>
      </div>
    </nav>
  );
}
