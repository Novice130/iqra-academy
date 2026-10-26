"use client";

/**
 * @fileoverview What a booking request did: which weeks were booked (each
 * linking to its class page) and which were skipped, and why.
 */

import Link from "next/link";
import LocalTime from "@/components/LocalTime";
import { Badge, Panel } from "@/app/admin/_components/ui";

export interface AssignOutcome {
  message?: string;
  error?: string;
  created: { date: string; scheduledStart: string; sessionId: string }[];
  skipped: { date: string; scheduledStart: string | null; reason: string }[];
}

export default function AssignResult({ outcome }: { outcome: AssignOutcome }) {
  const { created, skipped } = outcome;
  return (
    <Panel
      title={created.length > 0 ? outcome.message ?? `Booked ${created.length}` : "Nothing was booked"}
      description={`${created.length} booked, ${skipped.length} skipped`}
    >
      <div role="status" aria-live="polite">
        {outcome.error && created.length === 0 && (
          <p className="mb-3 text-sm font-medium text-[var(--color-danger)]">{outcome.error}</p>
        )}
        <ul className="space-y-2 text-sm">
          {created.map((c) => (
            <li key={c.sessionId} className="flex flex-wrap items-center gap-2">
              <Badge tone="success">Booked</Badge>
              <Link href={`/admin/sessions/${c.sessionId}`} className="font-medium text-[var(--accent)] hover:underline">
                <LocalTime iso={c.scheduledStart} mode="full-date" />, <LocalTime iso={c.scheduledStart} mode="time" withZone />
              </Link>
            </li>
          ))}
          {skipped.map((s, i) => (
            <li key={`${s.date}-${i}`} className="flex flex-wrap items-center gap-2">
              <Badge tone="warning">Skipped</Badge>
              <span className="font-medium">
                {s.scheduledStart ? (
                  <>
                    <LocalTime iso={s.scheduledStart} mode="full-date" />, <LocalTime iso={s.scheduledStart} mode="time" withZone />
                  </>
                ) : (
                  s.date
                )}
              </span>
              <span className="text-[var(--text-secondary)]">{s.reason}</span>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}
