"use client";

/**
 * @fileoverview The trial pipeline table: stage tabs with counts, search,
 * 25 a page, and per-trial follow-up and next-step links.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import LocalTime from "@/components/LocalTime";
import type { TrialRow } from "@/lib/admin-students";
import { Badge, EmptyState, btn, humanize, input, label, table } from "../_components/ui";
import Pagination, { PAGE_SIZE } from "../students/Pagination";
import ShortDate from "../students/ShortDate";
import FollowUpControl from "./FollowUpControl";
import { FOLLOW_UP_LABEL, STAGE_META, TRIAL_STAGES, type TrialStage } from "./stages";

type Filter = "ALL" | TrialStage;

export default function TrialsTable({ rows }: { rows: TrialRow[] }) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const counts = useMemo(() => {
    const c = Object.fromEntries(TRIAL_STAGES.map((s) => [s, 0])) as Record<TrialStage, number>;
    for (const r of rows) c[r.stage]++;
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "ALL" && r.stage !== filter) return false;
      if (!q) return true;
      return [r.contactName, r.contactEmail, r.profileName ?? "", r.teacherName].some((v) => v.toLowerCase().includes(q));
    });
  }, [rows, filter, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const visible = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: "ALL", label: "All", count: rows.length },
    ...TRIAL_STAGES.map((s) => ({ key: s, label: STAGE_META[s].label, count: counts[s] })),
  ];

  return (
    <div>
      <div className="flex flex-col gap-3 p-4 border-b border-[var(--border)] lg:flex-row lg:items-end lg:justify-between">
        <div role="group" aria-label="Filter by stage" className="flex flex-wrap gap-1.5">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              aria-pressed={filter === t.key}
              onClick={() => { setFilter(t.key); setPage(0); }}
              className={`h-8 px-3 rounded-lg text-xs font-semibold border transition focus-visible:outline-2 focus-visible:outline-[var(--border-focus)] ${
                filter === t.key
                  ? "bg-[var(--accent-light)] text-[var(--accent)] border-[var(--accent)]/30"
                  : "bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border)] hover:text-[var(--text-primary)]"
              }`}
            >
              {t.label} <span className="tabular-nums opacity-70">({t.count})</span>
            </button>
          ))}
        </div>
        <div className="w-full lg:w-72">
          <label htmlFor="trial-search" className={label}>Search</label>
          <input id="trial-search" type="search" className={input} placeholder="Family, email, student or teacher"
            value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
        </div>
      </div>

      {filter !== "ALL" && (
        <p className="px-4 pt-3 text-xs text-[var(--text-secondary)]">{STAGE_META[filter].hint}</p>
      )}

      {visible.length === 0 ? (
        <EmptyState
          title={rows.length === 0 ? "No trial classes yet" : "No trials match"}
          body={rows.length === 0 ? "Trials appear here when a family books one from their dashboard." : "Pick another stage or clear the search."}
        />
      ) : (
        <div className={table.wrap}>
          <table className={`${table.table} min-w-[1080px]`}>
            <thead>
              <tr>
                <th scope="col" className={table.th}>Trial time</th>
                <th scope="col" className={table.th}>Contact</th>
                <th scope="col" className={table.th}>Student</th>
                <th scope="col" className={table.th}>Teacher</th>
                <th scope="col" className={table.th}>Stage</th>
                <th scope="col" className={table.th}>Booked</th>
                <th scope="col" className={`${table.th} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const meta = STAGE_META[r.stage];
                return (
                  <tr key={r.sessionId} className={table.tr}>
                    <td className={`${table.td} whitespace-nowrap`}>
                      <LocalTime iso={r.startsAt} mode="date-time" withZone />
                      <div className="mt-1">
                        <Link href={`/admin/sessions/${r.sessionId}`} className="text-xs text-[var(--accent)] hover:underline">
                          Open class
                        </Link>
                      </div>
                    </td>
                    <td className={table.td}>
                      <div className="font-semibold">{r.contactName}</div>
                      {r.contactEmail && (
                        <a href={`mailto:${r.contactEmail}`} className="block text-xs text-[var(--text-secondary)] hover:underline break-all">
                          {r.contactEmail}
                        </a>
                      )}
                      {r.contactPhone && (
                        <a href={`tel:${r.contactPhone}`} className="block text-xs text-[var(--text-secondary)] hover:underline">
                          {r.contactPhone}
                        </a>
                      )}
                    </td>
                    <td className={table.td}>
                      {r.profileId ? (
                        <Link href={`/admin/students/${r.profileId}`} className="hover:text-[var(--accent)] hover:underline">
                          {r.profileName}
                        </Link>
                      ) : (
                        <span className="text-xs text-[var(--text-tertiary)]">No child profile</span>
                      )}
                      {r.track && <div className="text-xs text-[var(--text-secondary)]">{humanize(r.track)}</div>}
                    </td>
                    <td className={table.td}>{r.teacherName}</td>
                    <td className={table.td}>
                      <div className="flex flex-col items-start gap-1">
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                        {r.followUp && r.followUp.value !== "NONE" && (
                          <span className="text-xs text-[var(--text-secondary)]">
                            {FOLLOW_UP_LABEL[r.followUp.value]}
                            {r.followUp.by ? ` by ${r.followUp.by}` : ""}, <ShortDate iso={r.followUp.at} />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={`${table.td} whitespace-nowrap text-[var(--text-secondary)]`}><ShortDate iso={r.bookedAt} /></td>
                    <td className={`${table.td} text-right`}>
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex flex-wrap justify-end gap-1">
                          {r.profileId && (
                            <Link href={`/admin/assign-student?studentId=${encodeURIComponent(r.profileId)}`} className={btn.ghost}>
                              Book a class
                            </Link>
                          )}
                          <Link href={`/admin/invoices?userId=${encodeURIComponent(r.familyUserId)}`} className={btn.ghost}>
                            Invoice
                          </Link>
                        </div>
                        <FollowUpControl row={r} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={current} total={filtered.length} onPage={setPage} noun="trials" />
    </div>
  );
}
