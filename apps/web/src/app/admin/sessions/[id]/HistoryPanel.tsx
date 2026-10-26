/**
 * @fileoverview The audit trail of one class, newest first.
 *
 * Entries are targeted `session:<id>` (the house format in lib/audit.ts);
 * what happened is in `metadata.op`, because the audit enum has no
 * per-operation values for sessions.
 */

import LocalTime from "@/components/LocalTime";
import { EmptyState, Panel, humanize } from "@/app/admin/_components/ui";

export interface HistoryEntry {
  id: string;
  action: string;
  actorName: string | null;
  createdAt: string;
  metadata: Record<string, unknown>;
}

const OP_LABEL: Record<string, string> = {
  "session.create": "Booked",
  "session.cancel": "Cancelled",
  "session.reschedule": "Rescheduled",
  "session.reassign": "Teacher changed",
  "session.no_show": "Marked no-show",
  "session.complete": "Marked completed",
  "session.status": "Status changed",
  "session.rename": "Renamed",
  "session.delete": "Deleted",
};

function describe(entry: HistoryEntry): { label: string; detail: string | null } {
  const m = entry.metadata;
  const op = typeof m.op === "string" ? m.op : null;
  const label = (op && OP_LABEL[op]) || humanize(entry.action);
  const parts: string[] = [];
  if (typeof m.reason === "string" && m.reason) parts.push(`Reason: ${m.reason}`);
  if (typeof m.previousStatus === "string" && op && op !== "session.cancel") parts.push(`Was ${humanize(m.previousStatus).toLowerCase()}`);
  if (typeof m.fromTitle === "string" || typeof m.toTitle === "string") parts.push(`"${m.fromTitle ?? ""}" to "${m.toTitle ?? ""}"`);
  return { label, detail: parts.length ? parts.join(" · ") : null };
}

/** ISO strings the entry carries, rendered in the viewer's zone. */
function When({ m }: { m: Record<string, unknown> }) {
  const from = m.from as { start?: string } | undefined;
  const to = m.to as { start?: string } | undefined;
  if (from?.start && to?.start) {
    return (
      <span>
        <LocalTime iso={from.start} mode="date-time" /> to <LocalTime iso={to.start} mode="date-time" withZone />
      </span>
    );
  }
  if (typeof m.scheduledStart === "string") {
    return (
      <span>
        For <LocalTime iso={m.scheduledStart} mode="date-time" withZone />
      </span>
    );
  }
  return null;
}

export default function HistoryPanel({ entries }: { entries: HistoryEntry[] }) {
  return (
    <Panel title="History" description="Every change recorded against this class.">
      {entries.length === 0 ? (
        <EmptyState title="No recorded changes" body="Classes booked before audit logging, or never changed, have no history." />
      ) : (
        <ol className="space-y-3">
          {entries.map((e) => {
            const { label, detail } = describe(e);
            return (
              <li key={e.id} className="border-l-2 border-[var(--border)] pl-3">
                <div className="text-sm font-medium text-[var(--text-primary)]">{label}</div>
                <div className="text-xs text-[var(--text-secondary)]">
                  <LocalTime iso={e.createdAt} mode="date-time" withZone /> by {e.actorName ?? "System"}
                </div>
                {detail && <div className="mt-0.5 text-xs text-[var(--text-secondary)]">{detail}</div>}
                <div className="mt-0.5 text-xs text-[var(--text-secondary)]">
                  <When m={e.metadata} />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}
