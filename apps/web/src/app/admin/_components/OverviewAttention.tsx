/**
 * @fileoverview "Needs attention" on the admin overview.
 *
 * Only items computed from data we hold: a live room without its teacher
 * (LiveKit's participant list), a class still SCHEDULED well after its start
 * or IN_PROGRESS well after its end (session rows), overdue invoices, booked
 * trials, and what starts in the next two hours. Nothing is inferred.
 */

import Link from "next/link";
import LocalTime from "@/components/LocalTime";
import type { AttentionSessions, AdminOverview, OverviewClass } from "@/lib/admin-metrics";
import type { LiveSnapshot } from "@/lib/admin-live";
import { money } from "@/lib/money";
import { Badge, EmptyState, Panel, type Tone } from "./ui";

interface Item {
  key: string;
  tone: Tone;
  tag: string;
  title: React.ReactNode;
  detail?: React.ReactNode;
  href: string;
  linkLabel: string;
}

const PER_KIND = 5;

function classItems(list: OverviewClass[], kind: string, tone: Tone, tag: string, detail: (c: OverviewClass) => React.ReactNode): Item[] {
  return list.slice(0, PER_KIND).map((c) => ({
    key: `${kind}-${c.sessionId}`,
    tone,
    tag,
    title: c.title,
    detail: detail(c),
    href: `/admin/sessions/${c.sessionId}`,
    linkLabel: "Open class",
  }));
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export default function OverviewAttention({
  metrics,
  sessions,
  live,
}: {
  metrics: AdminOverview;
  sessions: AttentionSessions;
  live: LiveSnapshot;
}) {
  const items: Item[] = [];

  if (live.unavailable) {
    items.push({
      key: "livekit",
      tone: "danger",
      tag: "Video service",
      title: "Live rooms can't be listed",
      detail: "The video service didn't answer, so live classes aren't shown.",
      href: "/admin/system",
      linkLabel: "System health",
    });
  }

  for (const r of live.rooms.filter((r) => r.teacherConnected === false).slice(0, PER_KIND)) {
    items.push({
      key: `noteacher-${r.sessionId}`,
      tone: "danger",
      tag: "No teacher",
      title: r.title,
      detail: `${plural(r.participantCount, "person", "people")} in the room without ${r.teacherName}.`,
      href: "/admin/live-classes",
      linkLabel: "See live room",
    });
  }

  items.push(
    ...classItems(sessions.overrunning, "over", "warning", "Not closed", (c) => (
      <>
        {c.teacherName}. Still in progress; was due to end at <LocalTime iso={c.endsAt} mode="date-time" />.
      </>
    )),
    ...classItems(sessions.notStarted, "late", "warning", "Not started", (c) => (
      <>
        {c.teacherName}. Was due to start at <LocalTime iso={c.scheduledStart} mode="time" />.
      </>
    ))
  );

  const moreSessions =
    Math.max(0, sessions.overrunning.length - PER_KIND) + Math.max(0, sessions.notStarted.length - PER_KIND);
  if (moreSessions > 0) {
    items.push({
      key: "more-sessions",
      tone: "neutral",
      tag: "More",
      title: `${plural(moreSessions, "more class", "more classes")} need a look`,
      href: "/admin/scheduled-classes",
      linkLabel: "See classes",
    });
  }

  if (metrics.overdueInvoices > 0) {
    items.push({
      key: "overdue",
      tone: "danger",
      tag: "Overdue",
      title: `${plural(metrics.overdueInvoices, "invoice")} past due`,
      detail: metrics.overdueAmount.map((t) => money(t.cents, t.currency)).join(" + ") + " outstanding.",
      href: "/admin/invoices",
      linkLabel: "See invoices",
    });
  }

  if (metrics.upcomingTrials > 0) {
    items.push({
      key: "trials",
      tone: "info",
      tag: "Trials",
      title: `${plural(metrics.upcomingTrials, "trial class", "trial classes")} booked`,
      detail: "Prospective families waiting for their first class.",
      href: "/admin/trials",
      linkLabel: "See trials",
    });
  }

  if (sessions.startingSoon.length > 0) {
    const next = sessions.startingSoon[0];
    items.push({
      key: "soon",
      tone: "info",
      tag: "Next 2 hours",
      title: `${plural(sessions.startingSoon.length, "class", "classes")} starting soon`,
      detail: (
        <>
          Next: {next.title} with {next.teacherName} at <LocalTime iso={next.scheduledStart} mode="time" />.
        </>
      ),
      href: "/admin/scheduled-classes",
      linkLabel: "See classes",
    });
  }

  return (
    <Panel title="Needs attention" flush>
      {items.length === 0 ? (
        <EmptyState title="Nothing needs attention" body="No stuck classes, missing teachers or overdue invoices right now." />
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {items.map((it) => (
            <li key={it.key} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={it.tone}>{it.tag}</Badge>
                  <span className="text-sm font-medium text-[var(--text-primary)] break-words">{it.title}</span>
                </div>
                {it.detail && <p className="text-xs text-[var(--text-secondary)]">{it.detail}</p>}
              </div>
              <Link href={it.href} className="shrink-0 text-xs font-semibold text-[var(--accent)] hover:underline">
                {it.linkLabel}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
