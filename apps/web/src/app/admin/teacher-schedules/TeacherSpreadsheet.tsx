"use client";

/**
 * @fileoverview The teacher-week grid: controls, a desktop table, and mobile
 * cards for one chosen day. Both layouts render the same cells from
 * ScheduleCells.tsx, so they cannot disagree about a teacher's day.
 *
 * Labels are formatted in `zone` — the zone the server built the week in —
 * not the device's, so the day headers always match the days the data was
 * cut into.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatInZone } from "@/components/LocalTime";
import { toCsv } from "@/lib/csv";
import { EmptyState, Panel, btn, input, table } from "@/app/admin/_components/ui";
import { DaySummary, SlotList } from "./ScheduleCells";

export interface ScheduleDay {
  /** YYYY-MM-DD in the viewer's zone. */
  key: string;
  startIso: string;
  endIso: string;
  slots: { label: string; iso: string }[];
}

export interface TeacherScheduleData {
  id: string;
  name: string;
  email: string;
  timezone: string | null;
  available: { startIso: string; endIso: string }[];
  timeOff: { startIso: string; endIso: string; reason: string | null }[];
  sessions: {
    id: string;
    title: string;
    track: string;
    status: string;
    studentNames: string;
    startIso: string;
    endIso: string;
  }[];
}

const fmt = (iso: string, zone: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-US", { ...opts, timeZone: zone }).format(new Date(iso));

export default function TeacherSpreadsheet({
  teachers,
  days,
  zone,
  weekOffset,
}: {
  teachers: TeacherScheduleData[];
  days: ScheduleDay[];
  zone: string;
  weekOffset: number;
}) {
  const [search, setSearch] = useState("");
  const [detailed, setDetailed] = useState(false);
  const [mobileDay, setMobileDay] = useState(0);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? teachers.filter((t) => t.name.toLowerCase().includes(q) || t.email.toLowerCase().includes(q)) : teachers;
  }, [teachers, search]);

  const Cell = detailed ? SlotList : DaySummary;
  const range = `${fmt(days[0].startIso, zone, { month: "short", day: "numeric" })} – ${fmt(days[6].startIso, zone, { month: "short", day: "numeric", year: "numeric" })}`;

  const exportCsv = () => {
    const rows = shown.map((t) => {
      const booked = t.sessions.filter((s) => s.status !== "CANCELLED");
      const minutes = booked.reduce((sum, s) => sum + Math.max(0, Math.round((new Date(s.endIso).getTime() - new Date(s.startIso).getTime()) / 60000)), 0);
      return [t.name, t.email, t.timezone ?? "", days[0].key, booked.length, t.sessions.length - booked.length, minutes, t.available.length];
    });
    const csv = toCsv(["Teacher", "Email", "Teacher time zone", "Week starting", "Classes", "Cancelled", "Booked minutes", "Open slots offered"], rows);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `teacher-schedules-${days[0].key}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <nav aria-label="Week" className="flex flex-wrap items-center gap-2">
            <Link href={`/admin/teacher-schedules?week=${weekOffset - 1}`} className={btn.secondary}>
              Previous week
            </Link>
            <Link href="/admin/teacher-schedules" className={weekOffset === 0 ? btn.primary : btn.secondary} aria-current={weekOffset === 0 ? "page" : undefined}>
              This week
            </Link>
            <Link href={`/admin/teacher-schedules?week=${weekOffset + 1}`} className={btn.secondary}>
              Next week
            </Link>
            <span className="text-sm font-medium text-[var(--text-primary)]">{range}</span>
            <span className="text-xs text-[var(--text-secondary)]">Times in {zone}</span>
          </nav>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="teacher-search" className="sr-only">
              Search teachers
            </label>
            <input id="teacher-search" type="search" placeholder="Search teacher" value={search} onChange={(e) => setSearch(e.target.value)} className={`${input} w-44`} />
            <button type="button" className={btn.secondary} aria-pressed={detailed} onClick={() => setDetailed((v) => !v)}>
              {detailed ? "Summary view" : "Half-hour view"}
            </button>
            <button type="button" className={btn.secondary} onClick={exportCsv} disabled={shown.length === 0}>
              Export CSV
            </button>
          </div>
        </div>
      </Panel>

      {shown.length === 0 ? (
        <Panel>
          <EmptyState title="No teachers match" body="Clear the search to see everyone." />
        </Panel>
      ) : (
        <>
          <div className="hidden lg:block">
            <Panel flush>
              <div className={`${table.wrap} max-h-[750px]`}>
                <table className={`${table.table} table-fixed min-w-[1100px]`}>
                  <thead className="sticky top-0 z-10 bg-[var(--bg-elevated)]">
                    <tr>
                      <th scope="col" className={`${table.th} w-48`}>Teacher ({shown.length})</th>
                      {days.map((d) => (
                        <th key={d.key} scope="col" className={`${table.th} text-center`}>
                          <div>{fmt(d.startIso, zone, { weekday: "short" })}</div>
                          <div className="font-normal normal-case">{fmt(d.startIso, zone, { month: "short", day: "numeric" })}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((t) => (
                      <tr key={t.id} className="border-t border-[var(--border)] align-top">
                        <th scope="row" className="px-4 py-3 text-left font-normal">
                          <Link href={`/admin/teachers/${t.id}`} className="block truncate text-sm font-semibold text-[var(--text-primary)] hover:text-[var(--accent)]">
                            {t.name}
                          </Link>
                          <div className="truncate text-xs text-[var(--text-tertiary)]">{t.email}</div>
                          <div className="mt-1 text-xs text-[var(--text-secondary)]">
                            {t.sessions.filter((s) => s.status !== "CANCELLED").length} classes
                            {t.timezone && <> · {t.timezone}</>}
                          </div>
                        </th>
                        {days.map((d) => (
                          <td key={d.key} className="border-l border-[var(--border)] p-2">
                            <Cell teacher={t} day={d} zone={zone} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>

          <div className="space-y-3 lg:hidden">
            <div role="group" aria-label="Day" className="flex gap-2 overflow-x-auto pb-1">
              {days.map((d, i) => (
                <button
                  key={d.key}
                  type="button"
                  aria-pressed={mobileDay === i}
                  onClick={() => setMobileDay(i)}
                  className={`${mobileDay === i ? btn.primary : btn.secondary} shrink-0 h-auto py-1.5 flex-col`}
                >
                  <span>{fmt(d.startIso, zone, { weekday: "short" })}</span>
                  <span className="text-[11px] font-normal">{fmt(d.startIso, zone, { month: "short", day: "numeric" })}</span>
                </button>
              ))}
            </div>
            {shown.map((t) => (
              <Panel
                key={t.id}
                title={<Link href={`/admin/teachers/${t.id}`} className="hover:text-[var(--accent)]">{t.name}</Link>}
                description={`${formatInZone(days[mobileDay].startIso, "full-date", false, zone)}${t.timezone ? ` · teacher in ${t.timezone}` : ""}`}
              >
                <Cell teacher={t} day={days[mobileDay]} zone={zone} />
              </Panel>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
