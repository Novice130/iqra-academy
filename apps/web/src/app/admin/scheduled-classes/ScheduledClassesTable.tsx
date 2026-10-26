"use client";

/**
 * @fileoverview The scheduled-classes list: filters, viewer-zone day groups,
 * paging, and a cancel step per row.
 *
 * Everything other than cancelling — reschedule, change teacher, mark the
 * outcome — happens on the class's own page, /admin/sessions/[id], which
 * every row links to. Cancelling here asks for a reason and goes through the
 * same PATCH as that page, which notifies the families and the teacher.
 */

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import LocalTime, { dayKeyInZone, formatInZone, useViewerTimeZone } from "@/components/LocalTime";
import ClassActionButton from "@/components/ClassActionButton";
import { Badge, EmptyState, Panel, StatusBadge, btn, humanize, table } from "@/app/admin/_components/ui";
import CancelSessionForm from "../sessions/_components/CancelSessionForm";
import ScheduledClassFilters, { DEFAULT_FILTERS, type ClassFilters } from "./ScheduledClassFilters";

export interface ScheduledClassRow {
  id: string;
  title: string;
  track: string;
  origin: string;
  teacherId: string;
  teacherName: string;
  teacherEmail: string;
  studentNames: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: string;
}

export interface TeacherFilterOption {
  id: string;
  name: string;
}

const PAGE_SIZE = 25;
const DAY_MS = 24 * 60 * 60 * 1000;

export default function ScheduledClassesTable({
  initialClasses,
  teachers,
}: {
  initialClasses: ScheduledClassRow[];
  teachers: TeacherFilterOption[];
}) {
  const zone = useViewerTimeZone();
  const [classes, setClasses] = useState(initialClasses);
  const [filters, setFilters] = useState<ClassFilters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    const maxTime = filters.window === "ALL" ? Infinity : now + Number(filters.window) * DAY_MS;
    return classes.filter((c) => {
      if (filters.teacher !== "ALL" && c.teacherId !== filters.teacher) return false;
      if (filters.track !== "ALL" && c.track !== filters.track) return false;
      if (filters.status === "ACTIVE" ? c.status === "CANCELLED" : filters.status !== "ALL" && c.status !== filters.status) return false;
      if (new Date(c.scheduledStart).getTime() > maxTime) return false;
      if (!q) return true;
      return [c.title, c.teacherName, c.studentNames, c.track].some((v) => v.toLowerCase().includes(q));
    });
  }, [classes, filters, now]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Days are the viewer's days: a 23:00 UTC class is Tuesday in Chicago and
  // Wednesday in Karachi, and both admins should see their own answer.
  const days = useMemo(() => {
    const map = new Map<string, ScheduledClassRow[]>();
    for (const row of pageRows) {
      const key = dayKeyInZone(row.scheduledStart, zone || undefined);
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    return [...map.entries()];
  }, [pageRows, zone]);

  const onFilters = (next: ClassFilters) => {
    setFilters(next);
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <Panel>
        <ScheduledClassFilters value={filters} teachers={teachers} onChange={onFilters} />
        <p className="mt-3 text-xs text-[var(--text-secondary)]" aria-live="polite">
          {filtered.length} matching {filtered.length === 1 ? "class" : "classes"}
          {zone && <> · times in {zone}</>}
        </p>
      </Panel>

      {notice && (
        <p role="status" className="text-sm font-medium text-[var(--color-success)]">
          {notice}
        </p>
      )}

      <Panel flush>
        {filtered.length === 0 ? (
          <EmptyState
            title="No classes match"
            body="Try a wider window, another status, or clear the search."
            action={
              <button type="button" className={btn.secondary} onClick={() => onFilters(DEFAULT_FILTERS)}>
                Reset filters
              </button>
            }
          />
        ) : (
          <div className={table.wrap}>
            <table className={table.table}>
              <thead>
                <tr>
                  <th scope="col" className={table.th}>Time</th>
                  <th scope="col" className={table.th}>Class</th>
                  <th scope="col" className={table.th}>Teacher</th>
                  <th scope="col" className={table.th}>Students</th>
                  <th scope="col" className={table.th}>Status</th>
                  <th scope="col" className={`${table.th} text-right`}>Actions</th>
                </tr>
              </thead>
              {days.map(([day, rows]) => (
                <tbody key={day}>
                  <tr>
                    <th scope="colgroup" colSpan={6} className="px-4 py-2 text-left text-xs font-semibold text-[var(--text-secondary)] bg-[var(--bg-secondary)] border-t border-[var(--border)]">
                      {formatInZone(rows[0].scheduledStart, "full-date", false, zone || undefined)} · {rows.length} {rows.length === 1 ? "class" : "classes"}
                    </th>
                  </tr>
                  {rows.map((c) => {
                    const open = c.status === "SCHEDULED" || c.status === "IN_PROGRESS";
                    return (
                      <Fragment key={c.id}>
                        <tr className={table.tr}>
                          <td className={`${table.td} whitespace-nowrap font-medium`}>
                            <LocalTime iso={c.scheduledStart} mode="time" /> – <LocalTime iso={c.scheduledEnd} mode="time" />
                          </td>
                          <td className={table.td}>
                            <Link href={`/admin/sessions/${c.id}`} className="font-medium text-[var(--accent)] hover:underline">
                              {c.title}
                            </Link>
                            <div className="mt-1 flex flex-wrap gap-1">
                              <Badge>{humanize(c.track)}</Badge>
                              {c.origin !== "SCHEDULED" && <Badge>{humanize(c.origin)}</Badge>}
                            </div>
                          </td>
                          <td className={table.td}>
                            <div>{c.teacherName}</div>
                            <div className="text-xs text-[var(--text-tertiary)]">{c.teacherEmail}</div>
                          </td>
                          <td className={`${table.td} text-[var(--text-secondary)]`}>{c.studentNames || "No students booked"}</td>
                          <td className={table.td}>
                            <StatusBadge status={c.status} />
                          </td>
                          <td className={`${table.td} text-right`}>
                            <div className="flex items-center justify-end gap-2">
                              <ClassActionButton
                                session={{ id: c.id, scheduledStart: c.scheduledStart, scheduledEnd: c.scheduledEnd, status: c.status, title: c.title }}
                                viewer={{ role: "ORG_ADMIN", isAdmin: true }}
                                variant="compact"
                              />
                              <Link href={`/admin/sessions/${c.id}`} className={btn.ghost} aria-label={`Manage ${c.title}`}>
                                Manage
                              </Link>
                              {open && (
                                <button
                                  type="button"
                                  className={btn.ghost}
                                  aria-expanded={cancelling === c.id}
                                  onClick={() => {
                                    setNotice(null);
                                    setCancelling(cancelling === c.id ? null : c.id);
                                  }}
                                >
                                  Cancel
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {cancelling === c.id && (
                          <tr>
                            <td colSpan={6} className="px-4 pb-4">
                              <CancelSessionForm
                                sessionId={c.id}
                                onDismiss={() => setCancelling(null)}
                                onCancelled={(n) => {
                                  setClasses((prev) => prev.map((x) => (x.id === c.id ? { ...x, status: "CANCELLED" } : x)));
                                  setCancelling(null);
                                  setNotice(`"${c.title}" cancelled.${n > 0 ? ` ${n} ${n === 1 ? "person was" : "people were"} notified.` : ""}`);
                                }}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              ))}
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <nav aria-label="Pages" className="flex items-center justify-between gap-2 border-t border-[var(--border)] px-4 py-3 text-xs">
            <span className="text-[var(--text-secondary)]">
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button type="button" className={btn.secondary} onClick={() => setPage(currentPage - 1)} disabled={currentPage <= 1}>
                Previous
              </button>
              <button type="button" className={btn.secondary} onClick={() => setPage(currentPage + 1)} disabled={currentPage >= totalPages}>
                Next
              </button>
            </div>
          </nav>
        )}
      </Panel>
    </div>
  );
}
