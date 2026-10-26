"use client";

/**
 * @fileoverview The /admin/students table: search, filters, 25 a page.
 *
 * The whole org's list arrives with the page and is filtered here, the same
 * way UserRoleTable works — a school has hundreds of students, not millions,
 * and filtering in the browser keeps every keystroke instant.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import LocalTime from "@/components/LocalTime";
import type { StudentListRow } from "@/lib/admin-students";
import { Badge, EmptyState, humanize, input, label, table } from "../_components/ui";
import Pagination, { PAGE_SIZE } from "./Pagination";
import ShortDate from "./ShortDate";

const UNASSIGNED = "__none__";

function BillingBadge({ state }: { state: StudentListRow["billing"] }) {
  if (state === "OVERDUE") return <Badge tone="danger">Overdue</Badge>;
  if (state === "OPEN") return <Badge tone="warning">Unpaid invoice</Badge>;
  return <span className="text-xs text-[var(--text-tertiary)]">Paid up</span>;
}

export default function StudentsTable({ rows }: { rows: StudentListRow[] }) {
  const [search, setSearch] = useState("");
  const [track, setTrack] = useState("");
  const [teacher, setTeacher] = useState("");
  const [unpaidOnly, setUnpaidOnly] = useState(false);
  const [noUpcoming, setNoUpcoming] = useState(false);
  const [page, setPage] = useState(0);

  const tracks = useMemo(() => [...new Set(rows.map((r) => r.track))].sort(), [rows]);
  const teachers = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) if (r.teacherId && r.teacherName) m.set(r.teacherId, r.teacherName);
    return [...m].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (track && r.track !== track) return false;
      if (teacher === UNASSIGNED ? r.teacherId : teacher && r.teacherId !== teacher) return false;
      if (unpaidOnly && !r.billing) return false;
      if (noUpcoming && r.nextClassAt) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.parentName.toLowerCase().includes(q) ||
        r.parentEmail.toLowerCase().includes(q)
      );
    });
  }, [rows, search, track, teacher, unpaidOnly, noUpcoming]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const visible = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  /** Every filter change starts again from page one. */
  function update<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v);
      setPage(0);
    };
  }

  const filtersOn = !!(search || track || teacher || unpaidOnly || noUpcoming);

  return (
    <div>
      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 border-b border-[var(--border)]">
        <div className="sm:col-span-2 lg:col-span-1">
          <label htmlFor="student-search" className={label}>Search</label>
          <input
            id="student-search"
            type="search"
            className={input}
            placeholder="Student, parent or email"
            value={search}
            onChange={(e) => update(setSearch)(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="student-track" className={label}>Track</label>
          <select id="student-track" className={input} value={track} onChange={(e) => update(setTrack)(e.target.value)}>
            <option value="">All tracks</option>
            {tracks.map((t) => (
              <option key={t} value={t}>{humanize(t)}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="student-teacher" className={label}>Teacher</label>
          <select id="student-teacher" className={input} value={teacher} onChange={(e) => update(setTeacher)(e.target.value)}>
            <option value="">All teachers</option>
            <option value={UNASSIGNED}>No teacher yet</option>
            {teachers.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </div>
        <fieldset className="flex flex-col justify-end gap-1.5 text-sm text-[var(--text-primary)]">
          <legend className="sr-only">Quick filters</legend>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={unpaidOnly} onChange={(e) => update(setUnpaidOnly)(e.target.checked)} />
            Unpaid only
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={noUpcoming} onChange={(e) => update(setNoUpcoming)(e.target.checked)} />
            No upcoming class
          </label>
        </fieldset>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={rows.length === 0 ? "No students yet" : "No students match these filters"}
          body={
            rows.length === 0
              ? "Students appear here once a family signs up and adds a child profile."
              : "Clear a filter or search for a different name."
          }
        />
      ) : (
        <div className={table.wrap}>
          <table className={`${table.table} min-w-[1100px]`}>
            <thead>
              <tr>
                <th scope="col" className={table.th}>Student</th>
                <th scope="col" className={table.th}>Family account</th>
                <th scope="col" className={table.th}>Track</th>
                <th scope="col" className={table.th}>Teacher</th>
                <th scope="col" className={table.th}>Next class</th>
                <th scope="col" className={table.th}>Last class</th>
                <th scope="col" className={`${table.th} text-right`}>Attended (30d)</th>
                <th scope="col" className={table.th}>Billing</th>
                <th scope="col" className={table.th}>Joined</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} className={table.tr}>
                  <td className={table.td}>
                    <Link href={`/admin/students/${r.id}`} className="font-semibold hover:text-[var(--accent)] hover:underline">
                      {r.name}
                    </Link>
                  </td>
                  <td className={table.td}>
                    <div className="truncate max-w-[220px]">{r.parentName}</div>
                    <div className="truncate max-w-[220px] text-xs text-[var(--text-secondary)]">{r.parentEmail}</div>
                  </td>
                  <td className={table.td}><Badge tone="info">{humanize(r.track)}</Badge></td>
                  <td className={table.td}>
                    {r.teacherName ? (
                      <>
                        <div>{r.teacherName}</div>
                        <div className="text-xs text-[var(--text-tertiary)]">
                          {r.teacherSource === "slot" ? "Weekly slot" : "Latest class"}
                        </div>
                      </>
                    ) : (
                      <span className="text-xs text-[var(--text-tertiary)]">None yet</span>
                    )}
                  </td>
                  <td className={`${table.td} whitespace-nowrap`}>
                    {r.nextClassAt ? <LocalTime iso={r.nextClassAt} mode="date-time" /> : <Badge tone="warning">None booked</Badge>}
                  </td>
                  <td className={`${table.td} whitespace-nowrap`}>
                    {r.lastClassAt ? <LocalTime iso={r.lastClassAt} mode="date-time" /> : <span className="text-[var(--text-tertiary)]">—</span>}
                  </td>
                  <td className={`${table.td} text-right tabular-nums`}>{r.attended30d}</td>
                  <td className={table.td}><BillingBadge state={r.billing} /></td>
                  <td className={`${table.td} whitespace-nowrap text-[var(--text-secondary)]`}><ShortDate iso={r.joinedAt} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={current} total={filtered.length} onPage={setPage} noun={filtersOn ? "matching students" : "students"} />
    </div>
  );
}
