"use client";

/**
 * @fileoverview Dense Teacher Spreadsheet Component
 *
 * Displays teachers as rows and week days/slots as columns.
 * Highlights availability shading, scheduled class blocks, time-off hatching,
 * and live indicators. Supports week navigation, CSV export, and 1-click assignment prefill.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import LocalTime, { dayKeyInZone, useViewerTimeZone } from "@/components/LocalTime";

export interface TeacherScheduleData {
  id: string;
  name: string;
  email: string;
  timezone: string;
  availability: {
    dayOfWeek: number;
    startTime: string; // "09:00"
    endTime: string;   // "17:00"
  }[];
  timeOff: {
    startsAt: string;
    endsAt: string;
    reason?: string | null;
  }[];
  sessions: {
    id: string;
    title: string;
    track: string;
    studentNames: string;
    scheduledStart: string;
    scheduledEnd: string;
    status: string;
  }[];
}

const HOURS = [
  6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22
];

const HALF_HOUR_SLOTS = HOURS.flatMap((h) => [
  { hour: h, minute: 0, label: `${String(h).padStart(2, "0")}:00` },
  { hour: h, minute: 30, label: `${String(h).padStart(2, "0")}:30` },
]);

export default function TeacherSpreadsheet({
  teachers,
  weekOffset,
  weekStartIso,
}: {
  teachers: TeacherScheduleData[];
  weekOffset: number;
  weekStartIso: string;
}) {
  const router = useRouter();
  const viewerZone = useViewerTimeZone();
  const [search, setSearch] = useState("");
  const [selectedMobileDay, setSelectedMobileDay] = useState(0);
  const [viewMode, setViewMode] = useState<"summary" | "half-hour">("summary");

  // Compute 7 days of this week starting from weekStartIso
  const weekDays = useMemo(() => {
    const start = new Date(weekStartIso);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [weekStartIso]);

  // Filter teachers by name / email
  const filteredTeachers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return teachers;
    return teachers.filter(
      (t) => t.name.toLowerCase().includes(q) || t.email.toLowerCase().includes(q)
    );
  }, [teachers, search]);

  const handleExportCsv = () => {
    const headers = ["Teacher Name", "Email", "Timezone", "Scheduled Classes", "Total Booked Minutes"];
    const rows = filteredTeachers.map((t) => {
      const totalMins = t.sessions.reduce((acc, s) => {
        const start = new Date(s.scheduledStart).getTime();
        const end = new Date(s.scheduledEnd).getTime();
        return acc + Math.max(0, Math.round((end - start) / (60 * 1000)));
      }, 0);
      return [
        `"${t.name.replace(/"/g, '""')}"`,
        `"${t.email.replace(/"/g, '""')}"`,
        `"${t.timezone}"`,
        t.sessions.length,
        totalMins,
      ].join(",");
    });

    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `teacher-schedules-week-${weekOffset}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="p-4 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Week Navigation */}
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/teacher-schedules?week=${weekOffset - 1}`}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border)] hover:bg-[var(--bg-elevated)] transition"
          >
            ← Prev Week
          </Link>
          <Link
            href="/admin/teacher-schedules?week=0"
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border border-[var(--border)] transition ${
              weekOffset === 0
                ? "bg-[var(--accent)] text-white"
                : "bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
            }`}
          >
            This Week
          </Link>
          <Link
            href={`/admin/teacher-schedules?week=${weekOffset + 1}`}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border)] hover:bg-[var(--bg-elevated)] transition"
          >
            Next Week →
          </Link>
          <span className="text-xs text-[var(--text-secondary)] ml-2">
            {weekDays[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} –{" "}
            {weekDays[6].toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
          </span>
        </div>

        {/* Search, View Mode, Print, and CSV Export */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setViewMode((v) => (v === "summary" ? "half-hour" : "summary"))}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border)] hover:bg-[var(--bg-elevated)] transition cursor-pointer"
          >
            {viewMode === "summary" ? "⏱️ Detailed Slot Grid" : "📋 Summary View"}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border)] hover:bg-[var(--bg-elevated)] transition cursor-pointer no-print"
          >
            🖨️ Print View
          </button>
          <input
            type="text"
            placeholder="Search teacher..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-emerald-500/40 w-44"
          />
          <button
            onClick={handleExportCsv}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border)] hover:bg-[var(--bg-elevated)] transition"
          >
            📥 Export CSV
          </button>
        </div>
      </div>

      {/* Desktop Spreadsheet View */}
      <div className="hidden lg:block rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] shadow-xs overflow-hidden">
        <div className="overflow-x-auto max-h-[750px]">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 z-20 bg-[var(--bg-elevated)] shadow-xs">
              <tr className="border-b border-[var(--border)] text-[var(--text-secondary)] font-bold">
                <th className="p-4 w-60 sticky left-0 z-30 bg-[var(--bg-elevated)] border-r border-[var(--border)]">
                  Teacher ({filteredTeachers.length})
                </th>
                {weekDays.map((day, idx) => (
                  <th
                    key={idx}
                    className="p-3 text-center border-r border-[var(--border)] last:border-0 min-w-[200px]"
                  >
                    <div>{new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: viewerZone || undefined }).format(day)}</div>
                    <div className="text-[11px] text-[var(--text-tertiary)] font-normal">
                      {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: viewerZone || undefined }).format(day)}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-[var(--border)]">
              {filteredTeachers.map((teacher) => (
                <tr key={teacher.id} className="hover:bg-[var(--bg-secondary)]/30 transition">
                  {/* Sticky Teacher Column */}
                  <td className="p-4 sticky left-0 z-10 bg-[var(--bg-elevated)] border-r border-[var(--border)] align-top">
                    <div className="font-bold text-sm text-[var(--text-primary)] truncate">
                      {teacher.name}
                    </div>
                    <div className="text-[11px] text-[var(--text-tertiary)] truncate mt-0.5">
                      {teacher.email}
                    </div>
                    <div className="inline-block mt-2 px-2 py-0.5 rounded-md text-[10px] font-mono bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border)]">
                      🌐 {teacher.timezone || "UTC"}
                    </div>
                    <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-2">
                      {teacher.sessions.length} class{teacher.sessions.length === 1 ? "" : "es"} this week
                    </div>
                  </td>

                  {/* 7 Day Columns */}
                  {weekDays.map((day, dayIdx) => {
                    const dayKey = dayKeyInZone(day, viewerZone);
                    const dayOfWeek = day.getDay(); // 0-6

                    // Sessions on this day in viewer zone
                    const daySessions = teacher.sessions.filter((s) => {
                      return dayKeyInZone(s.scheduledStart, viewerZone) === dayKey;
                    });

                    // Availability declared for this weekday
                    const dayAvailabilities = teacher.availability.filter(
                      (a) => a.dayOfWeek === dayOfWeek
                    );

                    // Time-off overlapping this day
                    const dayStart = new Date(day);
                    dayStart.setHours(0, 0, 0, 0);
                    const dayEnd = new Date(day);
                    dayEnd.setHours(23, 59, 59, 999);
                    const dayTimeOff = teacher.timeOff.filter((to) => {
                      const s = new Date(to.startsAt);
                      const e = new Date(to.endsAt);
                      return s <= dayEnd && e >= dayStart;
                    });

                    const hasTimeOff = dayTimeOff.length > 0;
                    const hasAvailability = dayAvailabilities.length > 0;

                    return (
                      <td
                        key={dayIdx}
                        className={`p-2.5 border-r border-[var(--border)] last:border-0 align-top min-h-[120px] ${
                          hasTimeOff
                            ? "bg-amber-500/5"
                            : hasAvailability
                            ? "bg-emerald-500/[0.03]"
                            : "bg-transparent"
                        }`}
                      >
                        {viewMode === "half-hour" ? (
                          <div className="space-y-1 max-h-[380px] overflow-y-auto pr-1">
                            {HALF_HOUR_SLOTS.map((slot) => {
                              const matchingSession = daySessions.find((s) => {
                                const start = new Date(s.scheduledStart);
                                const slotDate = new Date(day);
                                slotDate.setHours(slot.hour, slot.minute, 0, 0);
                                return Math.abs(start.getTime() - slotDate.getTime()) < 25 * 60 * 1000;
                              });
                              const isAvailable = dayAvailabilities.some((a) => {
                                return slot.label >= a.startTime && slot.label < a.endTime;
                              });
                              const isLive = matchingSession?.status === "IN_PROGRESS";
                              return (
                                <div
                                  key={slot.label}
                                  className={`px-1.5 py-1 rounded-md text-[10px] flex items-center justify-between border ${
                                    matchingSession
                                      ? isLive
                                        ? "bg-emerald-600/30 border-red-500/50 text-white"
                                        : "bg-[var(--accent)]/20 border-[var(--accent)]/40 text-[var(--text-primary)]"
                                      : isAvailable && !hasTimeOff
                                      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                                      : hasTimeOff
                                      ? "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400"
                                      : "bg-transparent border-transparent text-zinc-500"
                                  }`}
                                >
                                  <span className="font-mono text-[9px] text-zinc-400">{slot.label}</span>
                                  {matchingSession ? (
                                    <Link
                                      href={`/dashboard/session/${matchingSession.id}`}
                                      className="truncate font-semibold max-w-[120px] hover:underline"
                                    >
                                      {matchingSession.studentNames}
                                    </Link>
                                  ) : hasTimeOff ? (
                                    <span className="italic text-[9px]">Off</span>
                                  ) : isAvailable ? (
                                    <Link
                                      href={`/admin/assign-student?teacherId=${teacher.id}&date=${dayKey}&time=${slot.label}`}
                                      className="font-semibold text-emerald-600 dark:text-emerald-400 hover:underline text-[9px]"
                                    >
                                      + Assign
                                    </Link>
                                  ) : (
                                    <span className="text-[9px] text-zinc-600 opacity-40">—</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <>
                            {/* Time Off Indicator */}
                            {hasTimeOff && (
                              <div className="mb-2 p-1.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-[10px] font-semibold flex items-center gap-1">
                                <span>🏖️</span>
                                <span>Time Off</span>
                              </div>
                            )}

                            {/* Availability Shading Badge */}
                            {hasAvailability && !hasTimeOff && (
                              <div className="mb-2 text-[10px] text-emerald-700 dark:text-emerald-400 font-medium flex items-center justify-between">
                                <span>
                                  🟢 {dayAvailabilities.map((a) => `${a.startTime}-${a.endTime}`).join(", ")}
                                </span>
                                <Link
                                  href={`/admin/assign-student?teacherId=${teacher.id}`}
                                  className="text-[10px] font-semibold text-[var(--accent)] hover:underline"
                                  title="Assign student in open availability"
                                >
                                  + Assign
                                </Link>
                              </div>
                            )}

                            {/* Scheduled Classes Blocks */}
                            {daySessions.length > 0 ? (
                              <div className="space-y-1.5">
                                {daySessions.map((session) => {
                                  const isLive = session.status === "IN_PROGRESS";
                                  return (
                                    <Link
                                      key={session.id}
                                      href={`/dashboard/session/${session.id}`}
                                      className={`block p-2 rounded-xl text-white text-[11px] leading-tight shadow-xs transition hover:scale-[1.02] ${
                                        isLive
                                          ? "bg-emerald-600 ring-2 ring-red-500"
                                          : "bg-[var(--accent)] hover:opacity-90"
                                      }`}
                                    >
                                      <div className="flex items-center justify-between gap-1">
                                        <span className="font-bold truncate">{session.studentNames}</span>
                                        {isLive && (
                                          <span className="relative flex h-2 w-2 shrink-0">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[10px] opacity-90 mt-0.5 flex items-center justify-between">
                                        <span>
                                          <LocalTime iso={session.scheduledStart} mode="time" />
                                        </span>
                                        <span className="uppercase text-[9px] bg-white/20 px-1 rounded">
                                          {session.track}
                                        </span>
                                      </div>
                                    </Link>
                                  );
                                })}
                              </div>
                            ) : hasAvailability && !hasTimeOff ? (
                              <div
                                onClick={() =>
                                  router.push(
                                    `/admin/assign-student?teacherId=${teacher.id}&date=${dayKey}`
                                  )
                                }
                                className="h-16 rounded-xl border border-dashed border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 text-[11px] font-medium cursor-pointer hover:bg-emerald-500/10 transition"
                              >
                                + Click to assign
                              </div>
                            ) : (
                              <div className="h-12 flex items-center justify-center text-[11px] text-[var(--text-tertiary)] italic">
                                No slots
                              </div>
                            )}
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Responsive Cards with Day Selector */}
      <div className="block lg:hidden space-y-4">
        {/* Horizontal Day Selector */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {weekDays.map((day, idx) => (
            <button
              key={idx}
              onClick={() => setSelectedMobileDay(idx)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold shrink-0 border transition ${
                selectedMobileDay === idx
                  ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                  : "bg-[var(--bg-elevated)] text-[var(--text-primary)] border-[var(--border)]"
              }`}
            >
              <div>{new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: viewerZone || undefined }).format(day)}</div>
              <div className="text-[10px] opacity-75">
                {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: viewerZone || undefined }).format(day)}
              </div>
            </button>
          ))}
        </div>

        {/* Teacher Cards for Selected Day */}
        <div className="space-y-3">
          {filteredTeachers.map((teacher) => {
            const activeDay = weekDays[selectedMobileDay];
            const activeDayKey = dayKeyInZone(activeDay, viewerZone);

            const daySessions = teacher.sessions.filter((s) => {
              return dayKeyInZone(s.scheduledStart, viewerZone) === activeDayKey;
            });

            return (
              <div
                key={teacher.id}
                className="p-4 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] shadow-xs space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-bold text-sm text-[var(--text-primary)]">{teacher.name}</h4>
                    <p className="text-xs text-[var(--text-tertiary)]">{teacher.email}</p>
                  </div>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-[var(--bg-secondary)] border border-[var(--border)]">
                    {teacher.timezone || "UTC"}
                  </span>
                </div>

                {daySessions.length > 0 ? (
                  <div className="space-y-2">
                    {daySessions.map((s) => (
                      <Link
                        key={s.id}
                        href={`/dashboard/session/${s.id}`}
                        className="block p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-xs"
                      >
                        <div className="flex items-center justify-between font-semibold text-[var(--text-primary)]">
                          <span>{s.studentNames}</span>
                          <span className="text-[11px] text-[var(--accent)]">{s.track}</span>
                        </div>
                        <div className="text-[11px] text-[var(--text-secondary)] mt-1">
                          <LocalTime iso={s.scheduledStart} mode="time" /> –{" "}
                          <LocalTime iso={s.scheduledEnd} mode="time" />
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[var(--text-tertiary)] italic">No classes scheduled on this day.</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <style jsx global>{`
        @media print {
          .no-print, header, nav, aside { display: none !important; }
          body { background: white !important; color: black !important; }
          table { width: 100% !important; border-collapse: collapse !important; font-size: 8pt !important; }
          th, td { border: 1px solid #ccc !important; padding: 4px !important; }
        }
      `}</style>
    </div>
  );
}
