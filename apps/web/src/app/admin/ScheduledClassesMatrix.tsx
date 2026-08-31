"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import LocalTime from "@/components/LocalTime";

export interface ScheduledClassItem {
  id: string;
  title: string;
  track: string;
  teacherName: string;
  teacherEmail: string;
  scheduledStart: string;
  scheduledEnd: string;
  students: string;
}

export default function ScheduledClassesMatrix({
  classes,
}: {
  classes: ScheduledClassItem[];
}) {
  const [selectedTeacher, setSelectedTeacher] = useState<string>("ALL");
  const [search, setSearch] = useState<string>("");

  const teachers = useMemo(() => {
    const set = new Set<string>();
    for (const c of classes) {
      if (c.teacherName) set.add(c.teacherName);
    }
    return Array.from(set).sort();
  }, [classes]);

  const filteredClasses = useMemo(() => {
    const q = search.trim().toLowerCase();
    return classes.filter((c) => {
      if (selectedTeacher !== "ALL" && c.teacherName !== selectedTeacher) return false;
      if (!q) return true;
      return (
        c.title.toLowerCase().includes(q) ||
        c.teacherName.toLowerCase().includes(q) ||
        c.students.toLowerCase().includes(q) ||
        c.track.toLowerCase().includes(q)
      );
    });
  }, [classes, selectedTeacher, search]);

  // Group classes by Date string (YYYY-MM-DD) for tabular clarity
  const groupedByDate = useMemo(() => {
    const map = new Map<string, ScheduledClassItem[]>();
    for (const c of filteredClasses) {
      const dateKey = c.scheduledStart.slice(0, 10);
      const list = map.get(dateKey) ?? [];
      list.push(c);
      map.set(dateKey, list);
    }
    return map;
  }, [filteredClasses]);

  return (
    <section className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] shadow-sm overflow-hidden space-y-4">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[var(--border)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg">📅</span>
            <h2 className="text-base font-bold text-[var(--text-primary)]">
              Scheduled Classes Matrix ({classes.length})
            </h2>
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Upcoming scheduled classes organized per teacher and date.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={selectedTeacher}
            onChange={(e) => setSelectedTeacher(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          >
            <option value="ALL">All Teachers ({teachers.length})</option>
            {teachers.map((t) => (
              <option key={t} value={t}>
                Teacher: {t}
              </option>
            ))}
          </select>

          <input
            type="text"
            placeholder="Search student or class..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          />

          <Link
            href="/admin/assign-student"
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition"
          >
            + Assign Student
          </Link>
        </div>
      </div>

      {/* Tabular Matrix Table */}
      <div className="p-6 pt-0">
        {filteredClasses.length === 0 ? (
          <div className="text-center py-10 text-sm text-[var(--text-secondary)]">
            No scheduled classes found matching the selected filters.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr
                  className="border-b border-[var(--border)] uppercase tracking-wider font-bold text-[var(--text-secondary)]"
                  style={{ background: "var(--bg-secondary)" }}
                >
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4">Teacher</th>
                  <th className="py-3 px-4">Student(s)</th>
                  <th className="py-3 px-4">Track</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {Array.from(groupedByDate.entries()).map(([dateStr, items]) => (
                  <tr key={dateStr} className="contents">
                    <td
                      colSpan={6}
                      className="py-2 px-4 font-semibold text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 border-t border-b border-[var(--border)]"
                    >
                      📅 {new Date(dateStr).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", year: "numeric" })} ({items.length} {items.length === 1 ? "class" : "classes"})
                    </td>
                    {items.map((item) => (
                      <tr
                        key={item.id}
                        className="hover:bg-[var(--bg-secondary)]/60 transition group"
                      >
                        <td className="py-3 px-4 font-medium text-[var(--text-primary)]">
                          <LocalTime iso={item.scheduledStart} mode="time" /> –{" "}
                          <LocalTime iso={item.scheduledEnd} mode="time" />
                        </td>
                        <td className="py-3 px-4 font-semibold text-[var(--text-primary)]">
                          {item.teacherName}
                        </td>
                        <td className="py-3 px-4 text-[var(--text-secondary)]">
                          {item.students || "No students assigned"}
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            {item.track}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                            Scheduled
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Link
                            href={`/dashboard/session/${item.id}`}
                            className="font-semibold text-[var(--accent)] hover:underline"
                          >
                            Open Class →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
