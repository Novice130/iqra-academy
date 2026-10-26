"use client";

/**
 * @fileoverview The teachers list: search and sortable columns.
 *
 * Sorting is client-side — a school has tens of teachers, not thousands, and
 * the server has already done the expensive part.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import LocalTime from "@/components/LocalTime";
import type { TeacherListRow } from "@/lib/admin-teachers";
import { ROLE_LABELS } from "@/lib/roles";
import { Badge, EmptyState, input, table } from "../_components/ui";

type SortKey = "name" | "activeStudents" | "classesThisWeek" | "secondsLast30" | "noShowsLast30" | "nextTimeOff";

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: "name", label: "Teacher" },
  { key: "activeStudents", label: "Active students", numeric: true },
  { key: "classesThisWeek", label: "Classes this week", numeric: true },
  { key: "secondsLast30", label: "Hours, 30 days", numeric: true },
  { key: "noShowsLast30", label: "No-shows, 30 days", numeric: true },
  { key: "nextTimeOff", label: "Next time off" },
];

function sortValue(r: TeacherListRow, key: SortKey): string | number {
  if (key === "name") return r.name.toLowerCase();
  // No time off sorts last whichever way you sort.
  if (key === "nextTimeOff") return r.nextTimeOff ? new Date(r.nextTimeOff.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
  return r[key];
}

export default function TeachersTable({ rows }: { rows: TeacherListRow[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "name", dir: 1 });

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? rows.filter((r) => r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q))
      : rows;
    return [...filtered].sort((a, b) => {
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      return (av < bv ? -1 : av > bv ? 1 : 0) * sort.dir;
    });
  }, [rows, query, sort]);

  function toggle(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "name" || key === "nextTimeOff" ? 1 : -1 }));
  }

  return (
    <div>
      <div className="px-4 py-3 sm:px-5 border-b border-[var(--border)]">
        <label htmlFor="teacher-search" className="sr-only">
          Search teachers
        </label>
        <input
          id="teacher-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email"
          className={`${input} sm:max-w-xs`}
        />
      </div>

      {visible.length === 0 ? (
        <EmptyState title="No teachers match" body={`Nothing matches "${query}".`} />
      ) : (
        <div className={table.wrap}>
          <table className={table.table}>
            <thead>
              <tr>
                {COLUMNS.map((c) => {
                  const active = sort.key === c.key;
                  return (
                    <th
                      key={c.key}
                      scope="col"
                      className={`${table.th} ${c.numeric ? "text-right" : ""}`}
                      aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
                    >
                      <button
                        type="button"
                        onClick={() => toggle(c.key)}
                        className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-[var(--border-focus)] rounded cursor-pointer"
                      >
                        {c.label}
                        <span aria-hidden="true">{active ? (sort.dir === 1 ? "▲" : "▼") : ""}</span>
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} className={table.tr}>
                  <td className={table.td}>
                    <Link href={`/admin/teachers/${r.id}`} className="font-semibold hover:text-[var(--accent)] hover:underline">
                      {r.name}
                    </Link>
                    {r.role !== "TEACHER" && (
                      <span className="ml-2">
                        <Badge tone="info">{ROLE_LABELS[r.role]}</Badge>
                      </span>
                    )}
                    <div className="text-xs text-[var(--text-secondary)]">{r.email}</div>
                    <div className="text-xs text-[var(--text-tertiary)]">{r.timezone ?? "Time zone not set"}</div>
                  </td>
                  <td className={`${table.td} text-right tabular-nums`}>{r.activeStudents}</td>
                  <td className={`${table.td} text-right tabular-nums`}>{r.classesThisWeek}</td>
                  <td className={`${table.td} text-right tabular-nums`}>{(r.secondsLast30 / 3600).toFixed(1)}</td>
                  <td className={`${table.td} text-right tabular-nums`}>
                    {r.noShowsLast30 > 0 ? <Badge tone="danger">{r.noShowsLast30}</Badge> : 0}
                  </td>
                  <td className={`${table.td} whitespace-nowrap`}>
                    {r.nextTimeOff ? (
                      <>
                        {r.awayNow && (
                          <span className="mr-1.5">
                            <Badge tone="warning">Away now</Badge>
                          </span>
                        )}
                        <LocalTime iso={r.nextTimeOff.startsAt} mode="date" />
                        {" – "}
                        <LocalTime iso={r.nextTimeOff.endsAt} mode="date" />
                      </>
                    ) : (
                      <span className="text-[var(--text-tertiary)]">None</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
