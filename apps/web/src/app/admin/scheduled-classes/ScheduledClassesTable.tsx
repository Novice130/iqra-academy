"use client";

/**
 * @fileoverview One page of scheduled classes, grouped into the viewer's
 * days, with a cancel step per class.
 *
 * Each entry is a whole class (every session row sharing its room) and links
 * to the canonical row's /admin/sessions/[id] page, where it can be
 * rescheduled, reassigned or marked. Cancelling here goes through the same
 * PATCH, which cancels every row of the class and notifies the families and
 * the teacher.
 *
 * Every date is formatted in `zone`, which the server resolved and used to
 * render this page — not the browser's own zone, which is unknown during the
 * server render and would make the two disagree about which day a class is in.
 */

import { Fragment, useState } from "react";
import Link from "next/link";
import { dayKeyInZone, formatInZone } from "@/components/LocalTime";
import ClassActionButton from "@/components/ClassActionButton";
import { Badge, EmptyState, Panel, StatusBadge, btn, humanize, table } from "@/app/admin/_components/ui";
import CancelSessionForm from "../sessions/_components/CancelSessionForm";
import type { ClassFilterValues, ClassRow } from "./load";

function pageHref(filters: ClassFilterValues, page: number): string {
  const q = new URLSearchParams();
  if (filters.teacher !== "ALL") q.set("teacher", filters.teacher);
  if (filters.track !== "ALL") q.set("track", filters.track);
  if (filters.status !== "ACTIVE") q.set("status", filters.status);
  if (filters.window !== "30") q.set("window", filters.window);
  if (filters.q) q.set("q", filters.q);
  if (page > 1) q.set("page", String(page));
  const s = q.toString();
  return `/admin/scheduled-classes${s ? `?${s}` : ""}`;
}

export default function ScheduledClassesTable({
  classes: loaded,
  zone,
  filters,
  page,
  totalPages,
}: {
  classes: ClassRow[];
  zone: string;
  filters: ClassFilterValues;
  page: number;
  totalPages: number;
}) {
  // Cancelled here since the page loaded; the next navigation brings the
  // server's own answer.
  const [cancelledIds, setCancelledIds] = useState<string[]>([]);
  const classes = loaded.map((c) => (cancelledIds.includes(c.id) ? { ...c, status: "CANCELLED" } : c));
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const days: [string, ClassRow[]][] = [];
  for (const row of classes) {
    const key = dayKeyInZone(row.scheduledStart, zone);
    const last = days[days.length - 1];
    if (last && last[0] === key) last[1].push(row);
    else days.push([key, [row]]);
  }
  const time = (iso: string) => formatInZone(iso, "time", false, zone);

  return (
    <div className="space-y-4">
      {notice && (
        <p role="status" className="text-sm font-medium text-[var(--color-success)]">
          {notice}
        </p>
      )}

      <Panel flush>
        {classes.length === 0 ? (
          <EmptyState
            title="No classes match"
            body="Try a wider window, another status, or clear the search."
            action={
              <Link href="/admin/scheduled-classes" className={btn.secondary}>
                Reset filters
              </Link>
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
                      {formatInZone(rows[0].scheduledStart, "full-date", false, zone)} · {rows.length} {rows.length === 1 ? "class" : "classes"}
                    </th>
                  </tr>
                  {rows.map((c) => {
                    const open = c.status === "SCHEDULED" || c.status === "IN_PROGRESS";
                    return (
                      <Fragment key={c.id}>
                        <tr className={table.tr}>
                          <td className={`${table.td} whitespace-nowrap font-medium`}>
                            {time(c.scheduledStart)} – {time(c.scheduledEnd)}
                          </td>
                          <td className={table.td}>
                            <Link href={`/admin/sessions/${c.id}`} className="font-medium text-[var(--accent)] hover:underline">
                              {c.title}
                            </Link>
                            <div className="mt-1 flex flex-wrap gap-1">
                              <Badge>{humanize(c.track)}</Badge>
                              {c.origin !== "SCHEDULED" && <Badge>{humanize(c.origin)}</Badge>}
                              {c.rowCount > 1 && <Badge tone="info">Group class</Badge>}
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
                                  setCancelledIds((prev) => [...prev, c.id]);
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
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              {page > 1 ? (
                <Link href={pageHref(filters, page - 1)} className={btn.secondary}>
                  Previous
                </Link>
              ) : (
                <span className={`${btn.secondary} opacity-50`} aria-disabled="true">Previous</span>
              )}
              {page < totalPages ? (
                <Link href={pageHref(filters, page + 1)} className={btn.secondary}>
                  Next
                </Link>
              ) : (
                <span className={`${btn.secondary} opacity-50`} aria-disabled="true">Next</span>
              )}
            </div>
          </nav>
        )}
      </Panel>
    </div>
  );
}
