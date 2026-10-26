/**
 * @fileoverview One page of audit log rows.
 *
 * Server component. Details use <details> so expanding a row works without
 * JavaScript; the times are the only client part (viewer's zone).
 */

import Link from "next/link";
import LocalTime from "@/components/LocalTime";
import type { TargetLink } from "@/lib/admin-ops";
import { Badge, humanize, table, type Tone } from "../_components/ui";

export interface AuditRow {
  id: string;
  createdAt: string;
  action: string;
  target: string | null;
  metadata: unknown;
  ipAddress: string | null;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  actorRole: string | null;
}

/** Tone is a hint only; the action's name is always the label. */
function actionTone(action: string): Tone {
  if (/DELETED|CANCELLED|VOIDED|HIDDEN/.test(action)) return "danger";
  if (/ROLE_CHANGED|IMPERSONATION|SETTINGS|REFUND|RECORDING|UNMERGED/.test(action)) return "warning";
  if (/CREATED|ISSUED|PAID|RECEIVED|COMPLETED|MERGED/.test(action)) return "success";
  return "neutral";
}

function short(value: unknown): string {
  const s = typeof value === "string" ? value : JSON.stringify(value);
  return s && s.length > 60 ? `${s.slice(0, 60)}…` : (s ?? "");
}

const INLINE_KEYS = 3;

function Details({ metadata }: { metadata: unknown }) {
  if (metadata === null || metadata === undefined) return <span className="text-[var(--text-tertiary)]">—</span>;
  const entries = typeof metadata === "object" && !Array.isArray(metadata) ? Object.entries(metadata as Record<string, unknown>) : null;
  if (entries && entries.length === 0) return <span className="text-[var(--text-tertiary)]">—</span>;

  const full = JSON.stringify(metadata, null, 2);
  const inline = entries ? entries.slice(0, INLINE_KEYS) : [];
  const truncated = !entries || entries.length > INLINE_KEYS || inline.some(([, v]) => short(v) !== (typeof v === "string" ? v : JSON.stringify(v)));

  return (
    <div className="min-w-[14rem] max-w-md text-xs">
      {inline.length > 0 && (
        <dl className="space-y-0.5">
          {inline.map(([k, v]) => (
            <div key={k} className="flex gap-1.5 min-w-0">
              <dt className="shrink-0 font-semibold text-[var(--text-secondary)]">{k}:</dt>
              <dd className="min-w-0 break-all text-[var(--text-primary)]">{short(v)}</dd>
            </div>
          ))}
        </dl>
      )}
      {truncated && (
        <details className="mt-1">
          <summary className="cursor-pointer font-semibold text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-[var(--border-focus)] rounded">
            {entries ? `All ${entries.length} fields` : "Show details"}
          </summary>
          <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-[var(--bg-secondary)] p-2 font-mono text-[11px]">{full}</pre>
        </details>
      )}
    </div>
  );
}

function Actor({ row }: { row: AuditRow }) {
  if (!row.actorId) return <span className="text-[var(--text-secondary)]">System</span>;
  if (!row.actorEmail) return <span className="text-[var(--text-secondary)]">Unknown user</span>;
  const href = row.actorRole === "TEACHER" ? `/admin/teachers/${row.actorId}` : "/admin/users";
  return (
    <div className="min-w-0">
      <Link href={href} className="font-medium hover:text-[var(--accent)] hover:underline underline-offset-2">
        {row.actorName || row.actorEmail}
      </Link>
      <div className="text-xs text-[var(--text-secondary)] break-all">{row.actorEmail}</div>
    </div>
  );
}

export default function AuditTable({ rows, links }: { rows: AuditRow[]; links: Map<string, TargetLink> }) {
  return (
    <div className={table.wrap}>
      <table className={table.table}>
        <caption className="sr-only">Audit log entries, newest first</caption>
        <thead>
          <tr>
            <th scope="col" className={table.th}>Time</th>
            <th scope="col" className={table.th}>Actor</th>
            <th scope="col" className={table.th}>Action</th>
            <th scope="col" className={table.th}>Target</th>
            <th scope="col" className={table.th}>Details</th>
            <th scope="col" className={table.th}>IP</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const link = r.target ? links.get(r.target) : undefined;
            return (
              <tr key={r.id} className={`${table.tr} align-top`}>
                <td className={`${table.td} align-top whitespace-nowrap`}>
                  <time dateTime={r.createdAt}><LocalTime iso={r.createdAt} mode="date-time" withZone /></time>
                </td>
                <td className={`${table.td} align-top`}><Actor row={r} /></td>
                <td className={`${table.td} align-top`}><Badge tone={actionTone(r.action)}>{humanize(r.action)}</Badge></td>
                <td className={`${table.td} align-top`}>
                  {link ? (
                    <div className="min-w-0">
                      <Link href={link.href} className="font-medium hover:text-[var(--accent)] hover:underline underline-offset-2">{link.label}</Link>
                      <div className="font-mono text-[11px] text-[var(--text-tertiary)] break-all">{r.target}</div>
                    </div>
                  ) : (
                    <span className="font-mono text-xs break-all text-[var(--text-secondary)]">{r.target || "—"}</span>
                  )}
                </td>
                <td className={`${table.td} align-top`}><Details metadata={r.metadata} /></td>
                <td className={`${table.td} align-top font-mono text-xs whitespace-nowrap text-[var(--text-secondary)]`}>{r.ipAddress || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
