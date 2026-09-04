"use client";

/**
 * @fileoverview Scheduled Classes Table Component
 *
 * Semantic, accessible table with viewer-timezone grouping, multi-parameter filters,
 * pagination, and authorized cancellation/reassignment actions.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import LocalTime, { formatInZone, useViewerTimeZone } from "@/components/LocalTime";
import ClassActionButton from "@/components/ClassActionButton";
import CopyLinkButton from "@/components/CopyLinkButton";

export interface ScheduledClassRow {
  id: string;
  title: string;
  track: string;
  origin: string;
  teacherId: string;
  teacherName: string;
  teacherEmail: string;
  studentNames: string;
  studentProfileId?: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: string;
}

export interface TeacherFilterOption {
  id: string;
  name: string;
}

export default function ScheduledClassesTable({
  initialClasses,
  teachers,
}: {
  initialClasses: ScheduledClassRow[];
  teachers: TeacherFilterOption[];
}) {
  const viewerZone = useViewerTimeZone();
  const [classes, setClasses] = useState<ScheduledClassRow[]>(initialClasses);
  const [teacherFilter, setTeacherFilter] = useState<string>("ALL");
  const [trackFilter, setTrackFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ACTIVE");
  const [dateRangeFilter, setDateRangeFilter] = useState<string>("30");
  const [search, setSearch] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const PAGE_SIZE = 25;

  // Filtered dataset
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = Date.now();
    const maxDays = dateRangeFilter === "ALL" ? Infinity : Number(dateRangeFilter);
    const maxTime = now + maxDays * 24 * 60 * 60 * 1000;

    return classes.filter((c) => {
      // 1. Teacher filter
      if (teacherFilter !== "ALL" && c.teacherId !== teacherFilter && c.teacherName !== teacherFilter) {
        return false;
      }

      // 2. Track filter
      if (trackFilter !== "ALL" && c.track.toUpperCase() !== trackFilter.toUpperCase()) {
        return false;
      }

      // 3. Status filter
      if (statusFilter === "ACTIVE") {
        if (c.status === "CANCELLED") return false;
      } else if (statusFilter !== "ALL" && c.status !== statusFilter) {
        return false;
      }

      // 4. Date range filter
      if (dateRangeFilter !== "ALL") {
        const startMs = new Date(c.scheduledStart).getTime();
        if (startMs > maxTime) return false;
      }

      // 5. Search query
      if (!q) return true;
      return (
        c.title.toLowerCase().includes(q) ||
        c.teacherName.toLowerCase().includes(q) ||
        c.studentNames.toLowerCase().includes(q) ||
        c.track.toLowerCase().includes(q)
      );
    });
  }, [classes, teacherFilter, trackFilter, statusFilter, dateRangeFilter, search]);

  // Paginated slice
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  const currentPage = Math.min(page, totalPages);
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, currentPage]);

  // Group paginated items by viewer's calendar date
  const groupedByDay = useMemo(() => {
    const map = new Map<string, ScheduledClassRow[]>();
    for (const item of paginated) {
      // Group using viewer timezone, never raw UTC substring
      const dayKey = formatInZone(item.scheduledStart, "full-date", false, viewerZone || undefined);
      const list = map.get(dayKey) ?? [];
      list.push(item);
      map.set(dayKey, list);
    }
    return map;
  }, [paginated, viewerZone]);

  const handleCancel = async (sessionId: string) => {
    if (!confirm("Are you sure you want to cancel this scheduled class? Enrolled students will be notified.")) {
      return;
    }

    setActionLoading(sessionId);
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED" }),
      });

      if (res.ok) {
        setClasses((prev) =>
          prev.map((c) => (c.id === sessionId ? { ...c, status: "CANCELLED" } : c))
        );
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Failed to cancel class.");
      }
    } catch {
      alert("Network error cancelling class.");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          {/* Teacher Selector */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-1">
              Teacher
            </label>
            <select
              value={teacherFilter}
              onChange={(e) => {
                setTeacherFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            >
              <option value="ALL">All Teachers ({teachers.length})</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* Track Filter */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-1">
              Track
            </label>
            <select
              value={trackFilter}
              onChange={(e) => {
                setTrackFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            >
              <option value="ALL">All Tracks</option>
              <option value="QAIDAH">Qaidah</option>
              <option value="QURAN_READING">Quran Reading</option>
              <option value="HIFZ">Hifz</option>
              <option value="ISLAMIC_STUDIES">Islamic Studies</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-1">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            >
              <option value="ACTIVE">Active (Exclude Cancelled)</option>
              <option value="SCHEDULED">Scheduled Only</option>
              <option value="IN_PROGRESS">In Progress Only</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="ALL">Show All</option>
            </select>
          </div>

          {/* Date Window */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-1">
              Window
            </label>
            <select
              value={dateRangeFilter}
              onChange={(e) => {
                setDateRangeFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            >
              <option value="7">Next 7 Days</option>
              <option value="14">Next 14 Days</option>
              <option value="30">Next 30 Days</option>
              <option value="90">Next 90 Days</option>
              <option value="ALL">All Future</option>
            </select>
          </div>

          {/* Search Input */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-1">
              Search
            </label>
            <input
              type="text"
              placeholder="Student, teacher, track..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            >
            </input>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] pt-1">
          <div>
            Showing <span className="font-semibold text-[var(--text-primary)]">{filtered.length}</span> matching classes
            {viewerZone && <span> • Times resolved in <strong className="text-[var(--text-primary)]">{viewerZone}</strong></span>}
          </div>
          <Link
            href="/admin/assign-student"
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition"
          >
            + Schedule Class
          </Link>
        </div>
      </div>

      {/* Classes Table */}
      <div className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] shadow-xs overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="text-3xl">📅</div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">No Scheduled Classes Found</h3>
            <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto">
              No classes matched the selected filters. Try broadening your date window or teacher filter.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)] uppercase tracking-wider font-bold text-[var(--text-secondary)] bg-[var(--bg-secondary)]/50">
                  <th className="py-3 px-4">Time & Duration</th>
                  <th className="py-3 px-4">Teacher</th>
                  <th className="py-3 px-4">Student(s)</th>
                  <th className="py-3 px-4">Track & Origin</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {Array.from(groupedByDay.entries()).map(([dayString, items]) => (
                  <tr key={dayString} className="contents">
                    <td
                      colSpan={6}
                      className="py-2.5 px-4 font-semibold text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 border-t border-b border-[var(--border)]"
                    >
                      📅 {dayString} ({items.length} {items.length === 1 ? "class" : "classes"})
                    </td>
                    {items.map((item) => {
                      const isCancelled = item.status === "CANCELLED";
                      const isCompleted = item.status === "COMPLETED";
                      const isLive = item.status === "IN_PROGRESS";

                      return (
                        <tr
                          key={item.id}
                          className={`hover:bg-[var(--bg-secondary)]/60 transition group ${isCancelled ? "opacity-60 bg-zinc-50 dark:bg-zinc-900/30" : ""}`}
                        >
                          <td className="py-3.5 px-4 font-medium text-[var(--text-primary)]">
                            <div className="flex items-center gap-1.5 font-semibold">
                              <LocalTime iso={item.scheduledStart} mode="time" />
                              <span>–</span>
                              <LocalTime iso={item.scheduledEnd} mode="time" />
                            </div>
                            <div className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
                              {item.title}
                            </div>
                          </td>

                          <td className="py-3.5 px-4 font-semibold text-[var(--text-primary)]">
                            <div>{item.teacherName}</div>
                            <div className="text-[11px] text-[var(--text-tertiary)] font-normal">{item.teacherEmail}</div>
                          </td>

                          <td className="py-3.5 px-4 text-[var(--text-secondary)] font-medium">
                            {item.studentNames || "Unassigned"}
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                {item.track}
                              </span>
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-[var(--bg-secondary)] text-[var(--text-tertiary)] border border-[var(--border)]">
                                {item.origin}
                              </span>
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            {isLive ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                LIVE
                              </span>
                            ) : isCancelled ? (
                              <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                                Cancelled
                              </span>
                            ) : isCompleted ? (
                              <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 border border-zinc-300 dark:border-zinc-700">
                                Completed
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                                Scheduled
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <ClassActionButton
                                session={{
                                  id: item.id,
                                  scheduledStart: item.scheduledStart,
                                  scheduledEnd: item.scheduledEnd,
                                  status: item.status,
                                  title: item.title,
                                }}
                                viewer={{ role: "ORG_ADMIN", isAdmin: true }}
                                variant="compact"
                              />

                              <CopyLinkButton path={`/dashboard/session/${item.id}`} />

                              {!isCancelled && !isCompleted && (
                                <>
                                  <Link
                                    href={`/admin/assign-student?teacherId=${item.teacherId}`}
                                    className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] border border-[var(--border)] transition"
                                  >
                                    Reassign
                                  </Link>
                                  <button
                                    onClick={() => handleCancel(item.id)}
                                    disabled={actionLoading === item.id}
                                    className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900 transition disabled:opacity-50"
                                  >
                                    {actionLoading === item.id ? "..." : "Cancel"}
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-[var(--border)] flex items-center justify-between text-xs">
            <div className="text-[var(--text-secondary)]">
              Page <span className="font-semibold text-[var(--text-primary)]">{currentPage}</span> of{" "}
              <span className="font-semibold text-[var(--text-primary)]">{totalPages}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="px-3 py-1.5 rounded-lg bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border)] disabled:opacity-40 transition"
              >
                ← Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="px-3 py-1.5 rounded-lg bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border)] disabled:opacity-40 transition"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
