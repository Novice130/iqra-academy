/**
 * @fileoverview Admin UI kit — the shared pieces every /admin page is built from.
 *
 * Before this, each page hand-rolled its own header, cards, badges, buttons
 * and loading skeleton, and no two matched. Server-safe: no hooks, no
 * "use client", so server pages and client tables can both import it.
 *
 * Colours come from the tokens in globals.css (--bg-elevated, --border,
 * --text-*, --accent, --color-success/warning/danger). No emoji in labels;
 * status is always carried by text, never by colour alone.
 */

import Link from "next/link";

// ─── Class recipes ──────────────────────────────────────────────────────────
// For elements that need their own markup (a <button> with onClick, a form
// input). Keep variants here so every page's buttons look the same.

export const btn = {
  primary:
    "inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-xl text-sm font-semibold bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-focus)]",
  secondary:
    "inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-xl text-sm font-semibold bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border)] hover:bg-[var(--bg-secondary)] transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-focus)]",
  danger:
    "inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-xl text-sm font-semibold bg-[var(--color-danger)] text-white hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-focus)]",
  ghost:
    "inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)] transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-focus)]",
} as const;

export const input =
  "h-9 w-full px-3 rounded-xl text-sm bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-focus)] focus:ring-2 focus:ring-[var(--accent-light)]";

export const label = "block text-xs font-semibold text-[var(--text-secondary)] mb-1";

export const table = {
  wrap: "overflow-x-auto -mx-4 sm:mx-0",
  table: "w-full text-sm text-left",
  th: "px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] whitespace-nowrap",
  tr: "border-t border-[var(--border)] hover:bg-[var(--bg-secondary)]/60 transition-colors",
  td: "px-4 py-3 align-middle text-[var(--text-primary)]",
} as const;

// ─── Layout ─────────────────────────────────────────────────────────────────

export interface Crumb {
  label: string;
  href?: string;
}

/** The one h1 on a page, with optional breadcrumbs and right-aligned actions. */
export function PageHeader({
  title,
  description,
  crumbs,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  crumbs?: Crumb[];
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {crumbs && crumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-1 flex flex-wrap items-center gap-1.5 text-xs font-medium text-[var(--text-tertiary)]">
            {crumbs.map((c, i) => (
              <span key={`${c.label}-${i}`} className="flex items-center gap-1.5">
                {i > 0 && <span aria-hidden="true">/</span>}
                {c.href ? (
                  <Link href={c.href} className="hover:text-[var(--accent)] transition">
                    {c.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="text-[var(--text-secondary)]">
                    {c.label}
                  </span>
                )}
              </span>
            ))}
          </nav>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">{title}</h1>
        {description && <p className="mt-1 text-sm text-[var(--text-secondary)]">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** A titled surface. Most page content sits in one of these. */
export function Panel({
  title,
  description,
  actions,
  children,
  flush = false,
  id,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** Drop the body padding, for tables that run edge to edge. */
  flush?: boolean;
  id?: string;
}) {
  return (
    <section id={id} className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] overflow-hidden">
      {(title || actions) && (
        <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5 border-b border-[var(--border)]">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={flush ? "" : "p-4 sm:p-5"}>{children}</div>
    </section>
  );
}

export type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-[var(--text-primary)]",
  success: "text-[var(--color-success)]",
  warning: "text-[var(--color-warning)]",
  danger: "text-[var(--color-danger)]",
  info: "text-[var(--accent)]",
};

/** A single number with its label. Links through when `href` is given. */
export function StatCard({
  label: statLabel,
  value,
  hint,
  href,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  href?: string;
  tone?: Tone;
}) {
  const body = (
    <>
      <div className="text-xs font-medium text-[var(--text-secondary)]">{statLabel}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${TONE_TEXT[tone]}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-[var(--text-tertiary)]">{hint}</div>}
    </>
  );
  const cls = "block rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] p-4";
  return href ? (
    <Link href={href} className={`${cls} hover:border-[var(--accent)] transition`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Responsive grid for StatCards. */
export function StatGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{children}</div>;
}

const BADGE: Record<Tone, string> = {
  neutral: "bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border)]",
  success: "bg-[var(--color-success)]/10 text-[var(--color-success)] border-[var(--color-success)]/25",
  warning: "bg-[var(--color-warning)]/10 text-[var(--color-warning)] border-[var(--color-warning)]/25",
  danger: "bg-[var(--color-danger)]/10 text-[var(--color-danger)] border-[var(--color-danger)]/25",
  info: "bg-[var(--accent-light)] text-[var(--accent)] border-[var(--accent)]/25",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap ${BADGE[tone]}`}>
      {children}
    </span>
  );
}

/** Session, booking, invoice and trial statuses mapped to a tone. */
export function statusTone(status: string): Tone {
  switch (status) {
    case "IN_PROGRESS":
    case "PAID":
    case "COMPLETED":
    case "CONFIRMED":
    case "ACTIVE":
    case "PRESENT":
    case "CONVERTED":
      return "success";
    case "SCHEDULED":
    case "OPEN":
    case "PENDING":
    case "TRIALING":
      return "info";
    case "LATE":
    case "DRAFT":
    case "PAST_DUE":
    case "PAUSED":
      return "warning";
    case "CANCELLED":
    case "NO_SHOW":
    case "VOID":
    case "OVERDUE":
    case "UNCOLLECTIBLE":
    case "ABSENT":
    case "FAILED":
      return "danger";
    default:
      return "neutral";
  }
}

/** "IN_PROGRESS" → "In progress" */
export function humanize(value: string): string {
  const s = value.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={statusTone(status)}>{humanize(status)}</Badge>;
}

/** What a list shows when it has nothing in it. Never a blank box. */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div role="status" className="py-10 px-4 text-center">
      <div className="text-sm font-semibold text-[var(--text-primary)]">{title}</div>
      {body && <p className="mt-1 text-sm text-[var(--text-secondary)] max-w-md mx-auto">{body}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/** Label/value pairs, for detail pages. */
export function DefinitionList({ items }: { items: { term: string; value: React.ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((it) => (
        <div key={it.term} className="min-w-0">
          <dt className="text-xs font-medium text-[var(--text-tertiary)]">{it.term}</dt>
          <dd className="mt-0.5 text-sm text-[var(--text-primary)] break-words">{it.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

// ─── Loading ────────────────────────────────────────────────────────────────

function Bar({ className }: { className: string }) {
  return <div className={`rounded bg-[var(--border)] ${className}`} />;
}

/**
 * Generic loading.tsx body: header, optional stat row, one table panel.
 * Pages whose shape is very different can compose `Bar`-like blocks of their own.
 */
export function PageSkeleton({ stats = 0, rows = 8 }: { stats?: number; rows?: number }) {
  return (
    <div className="space-y-6 animate-pulse" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <div className="space-y-2">
        <Bar className="h-3 w-24 opacity-60" />
        <Bar className="h-7 w-56" />
        <Bar className="h-4 w-80 max-w-full opacity-60" />
      </div>
      {stats > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: stats }).map((_, i) => (
            <div key={i} className="h-[88px] rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] p-4 space-y-2">
              <Bar className="h-3 w-20 opacity-60" />
              <Bar className="h-6 w-14" />
            </div>
          ))}
        </div>
      )}
      <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] p-4 space-y-3">
        <Bar className="h-4 w-40" />
        {Array.from({ length: rows }).map((_, i) => (
          <Bar key={i} className="h-10 w-full opacity-60" />
        ))}
      </div>
    </div>
  );
}
