"use client";

/**
 * Teacher Weekly Hours & 24/7 Availability Editor.
 *
 * ── Features ─────────────────────────────────────────────────────────────────
 * - Full 24-hour round-the-clock selection (12:00 AM to 11:30 PM across 48 slots).
 * - Clean default empty state.
 * - Interactive green selection with micro-scale animations.
 * - Fast Repeat Mode (Default): Choose time of day -> Repeat on Mon-Fri, Mon-Sat, or All 7 Days.
 * - Expandable Custom Matrix: Full 7-day x 48-slot visual grid when custom days are selected.
 * - Works for teachers editing own availability and admins editing any teacher via ?teacherId=...
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ZONES, isValidZone } from "@/lib/zones";

const DAYS = [
  { id: "MONDAY", short: "Mon", full: "Monday" },
  { id: "TUESDAY", short: "Tue", full: "Tuesday" },
  { id: "WEDNESDAY", short: "Wed", full: "Wednesday" },
  { id: "THURSDAY", short: "Thu", full: "Thursday" },
  { id: "FRIDAY", short: "Fri", full: "Friday" },
  { id: "SATURDAY", short: "Sat", full: "Saturday" },
  { id: "SUNDAY", short: "Sun", full: "Sunday" },
] as const;

const SLOT_MINUTES = 30;

/** All 48 half-hour slots in 24 hours: 00:00 through 23:30 */
const ALL_CELLS: string[] = [];
for (let m = 0; m < 24 * 60; m += SLOT_MINUTES) {
  ALL_CELLS.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
}

const toMinutes = (t: string) => {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
};

const fromMinutes = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** 14:30 → "2:30 PM", 24:00 → "12:00 AM (Midnight)" */
function pretty(hhmm: string): string {
  const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
  if (h === 24 && m === 0) return "12:00 AM";
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

type RepeatOption = "weekdays" | "six_days" | "every_day" | "custom";

interface ApiSlot {
  dayOfWeek: string;
  startTime: string;
  endTime: string;
}

export default function AvailabilityPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const teacherId = searchParams.get("teacherId");
  const onboarding = searchParams.get("onboarding") === "1";

  const [targetTeacherName, setTargetTeacherName] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});
  const [zone, setZone] = useState<string>("");
  const [zoneConfirmed, setZoneConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);
  const [dragging, setDragging] = useState<null | boolean>(null);

  // Quick Repeat State
  const [repeatMode, setRepeatMode] = useState<RepeatOption>("weekdays");
  const [quickStart, setQuickStart] = useState<string>("09:00");
  const [quickEnd, setQuickEnd] = useState<string>("17:00");
  const [quickAppliedNote, setQuickAppliedNote] = useState<string | null>(null);

  // Load existing availability
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const qs = teacherId ? `?teacherId=${encodeURIComponent(teacherId)}` : "";
        const res = await fetch(`/api/teachers/availability${qs}`);
        if (!res.ok) throw new Error("Could not load availability hours.");
        const data = (await res.json()) as {
          teacherName?: string | null;
          timezone: string | null;
          slots: ApiSlot[];
        };
        if (cancelled) return;
        if (data.teacherName) {
          setTargetTeacherName(data.teacherName);
        }

        const map: Record<string, Set<string>> = {};
        for (const s of data.slots) {
          const set = map[s.dayOfWeek] ?? new Set<string>();
          for (let m = toMinutes(s.startTime); m + SLOT_MINUTES <= toMinutes(s.endTime); m += SLOT_MINUTES) {
            set.add(fromMinutes(m));
          }
          map[s.dayOfWeek] = set;
        }
        setSelected(map);

        if (data.timezone && isValidZone(data.timezone)) {
          setZone(data.timezone);
          setZoneConfirmed(!onboarding);
        } else {
          setZone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
          setZoneConfirmed(!onboarding);
        }
      } catch (err) {
        if (!cancelled) setNote({ text: err instanceof Error ? err.message : "Load failed.", bad: true });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [teacherId, onboarding]);

  const setCell = useCallback((day: string, cell: string, on: boolean) => {
    setSelected((prev) => {
      const set = new Set(prev[day] ?? []);
      if (on) set.add(cell);
      else set.delete(cell);
      return { ...prev, [day]: set };
    });
  }, []);

  const clearAll = useCallback(() => {
    setSelected({});
    setQuickAppliedNote(null);
  }, []);

  // Apply Quick Repeat pattern across chosen days
  const applyQuickRepeat = useCallback(() => {
    const startM = toMinutes(quickStart);
    const endM = toMinutes(quickEnd);
    if (startM >= endM) {
      setNote({ text: "Start time must be before end time.", bad: true });
      return;
    }

    const slotsToAdd: string[] = [];
    for (let m = startM; m < endM; m += SLOT_MINUTES) {
      slotsToAdd.push(fromMinutes(m));
    }

    let targetDays: readonly { id: string; short: string; full: string }[] = [];
    let repeatLabel = "";
    if (repeatMode === "weekdays") {
      targetDays = DAYS.slice(0, 5); // Mon-Fri
      repeatLabel = "Monday to Friday";
    } else if (repeatMode === "six_days") {
      targetDays = DAYS.slice(0, 6); // Mon-Sat
      repeatLabel = "Monday to Saturday";
    } else if (repeatMode === "every_day") {
      targetDays = DAYS; // Mon-Sun
      repeatLabel = "Every Day (Mon–Sun)";
    }

    setSelected((prev) => {
      const next: Record<string, Set<string>> = { ...prev };
      for (const d of targetDays) {
        next[d.id] = new Set(slotsToAdd);
      }
      return next;
    });

    setQuickAppliedNote(`Applied ${pretty(quickStart)} – ${pretty(quickEnd)} to ${repeatLabel}!`);
    setNote(null);
    setTimeout(() => setQuickAppliedNote(null), 3000);
  }, [quickStart, quickEnd, repeatMode]);

  const toggleDay = useCallback((dayId: string) => {
    setSelected((prev) => {
      const current = prev[dayId] ?? new Set<string>();
      const allSelected = ALL_CELLS.every((c) => current.has(c));
      const nextSet = new Set(current);

      if (allSelected) {
        ALL_CELLS.forEach((c) => nextSet.delete(c));
      } else {
        ALL_CELLS.forEach((c) => nextSet.add(c));
      }

      return { ...prev, [dayId]: nextSet };
    });
  }, []);

  /** Contiguous half-hour ticks converted to API range format */
  const ranges = useMemo(() => {
    const out: ApiSlot[] = [];
    for (const day of DAYS) {
      const cells = [...(selected[day.id] ?? [])].map(toMinutes).sort((a, b) => a - b);
      let i = 0;
      while (i < cells.length) {
        const start = cells[i];
        let end = start + SLOT_MINUTES;
        while (i + 1 < cells.length && cells[i + 1] === end) {
          end += SLOT_MINUTES;
          i++;
        }
        out.push({ dayOfWeek: day.id, startTime: fromMinutes(start), endTime: fromMinutes(end) });
        i++;
      }
    }
    return out;
  }, [selected]);

  const summaryByDay = useMemo(() => {
    const summary: Record<string, string[]> = {};
    for (const r of ranges) {
      if (!summary[r.dayOfWeek]) {
        summary[r.dayOfWeek] = [];
      }
      summary[r.dayOfWeek].push(`${pretty(r.startTime)} – ${pretty(r.endTime)}`);
    }
    return summary;
  }, [ranges]);

  const totalCells = useMemo(
    () => Object.values(selected).reduce((n, s) => n + s.size, 0),
    [selected]
  );
  const totalHours = (totalCells * SLOT_MINUTES) / 60;

  async function save() {
    setSaving(true);
    setNote(null);
    try {
      const res = await fetch("/api/teachers/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timezone: zone,
          slotMinutes: SLOT_MINUTES,
          slots: ranges,
          ...(teacherId ? { teacherId } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Save failed.");

      if (!teacherId) {
        await fetch("/api/me/timezone", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ timezone: zone }),
        }).catch(() => {});
      }

      setZoneConfirmed(true);
      setNote({ text: "✓ Availability saved! Students will see these hours in their local timezone.", bad: false });

      if (onboarding) {
        setTimeout(() => {
          router.push("/dashboard/teacher");
        }, 800);
      }

      // Broadcast live availability update signal for open student views/tabs
      try {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("teacher-availability-updated", { detail: { teacherId } }));
          localStorage.setItem("teacher_availability_updated", Date.now().toString());
          if ("BroadcastChannel" in window) {
            const bc = new BroadcastChannel("teacher-availability-sync");
            bc.postMessage({ type: "AVAILABILITY_UPDATED", teacherId, timestamp: Date.now() });
            bc.close();
          }
        }
      } catch {
        // Best-effort client notification
      }
    } catch (err) {
      setNote({ text: err instanceof Error ? err.message : "Save failed.", bad: true });
    } finally {
      setSaving(false);
    }
  }

  const gridLocked = !zoneConfirmed;

  return (
    <div
      className="p-6 sm:p-8 md:p-10 space-y-6 animate-fadeIn pb-12 max-w-6xl mx-auto"
      onMouseUp={() => setDragging(null)}
      onMouseLeave={() => setDragging(null)}
    >
      {/* Target Teacher Admin Banner */}
      {teacherId && (
        <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-800 dark:text-blue-300 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="text-base">👤</span>
            <span className="text-sm font-semibold">
              Admin Editing Mode: Managing calendar for <span className="underline font-bold">{targetTeacherName || "Teacher"}</span>
            </span>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-full bg-blue-500/20 font-medium">
            Teacher ID: {teacherId.slice(0, 8)}…
          </span>
        </div>
      )}
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[var(--border)]">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            {teacherId ? "Teacher 24/7 Weekly Hours" : "Your 24/7 Weekly Hours"}
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            {totalCells === 0
              ? "All boxes are empty by default. Select hours below or choose a repeat schedule."
              : `${totalHours.toFixed(1)} hours selected (${totalCells} half-hour slots across ${ranges.length} time blocks)`}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={clearAll}
            disabled={totalCells === 0}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 hover:bg-red-500/20 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Clear All
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || loading}
            className="px-5 py-2 rounded-xl text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-500 shadow-md hover:shadow-emerald-500/20 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? "Saving…" : onboarding ? "Save & Finish" : "Save Hours"}
          </button>
        </div>
      </div>

      {/* Timezone verification card */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              Timezone
            </div>
            <div className="text-sm font-medium text-[var(--text-primary)] mt-0.5">
              Times are set in <strong>{ZONES.find((z) => z.id === zone)?.label ?? zone}</strong>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <select
              value={ZONES.some((z) => z.id === zone) ? zone : ""}
              onChange={(e) => {
                if (e.target.value) {
                  setZone(e.target.value);
                  setZoneConfirmed(false);
                }
              }}
              className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {!ZONES.some((z) => z.id === zone) && <option value="">{zone} (detected)</option>}
              {ZONES.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.label}
                </option>
              ))}
            </select>
            {!zoneConfirmed && (
              <button
                type="button"
                onClick={() => setZoneConfirmed(true)}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 transition"
              >
                Confirm Zone
              </button>
            )}
          </div>
        </div>
      </div>

      {note && (
        <div
          className={`p-4 rounded-2xl text-sm font-medium border ${
            note.bad
              ? "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20"
              : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
          }`}
        >
          {note.text}
        </div>
      )}

      {quickAppliedNote && (
        <div className="p-3.5 rounded-2xl text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 animate-fadeIn">
          ✓ {quickAppliedNote}
        </div>
      )}

      {/* Current Schedule Summary */}
      {totalCells > 0 && (
        <div className="p-5 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                <span>📅</span> Your Current Active Hours
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                These are the hours students can book lessons with you. Use the Quick Repeat Scheduler or click Custom Days below to edit.
              </p>
            </div>
            <button
              type="button"
              onClick={clearAll}
              disabled={gridLocked}
              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 hover:bg-red-500/20 transition disabled:opacity-40 select-none shrink-0"
            >
              Start Fresh (Clear All)
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {DAYS.map((d) => {
              const dayRanges = summaryByDay[d.id];
              if (!dayRanges || dayRanges.length === 0) return null;
              return (
                <div key={d.id} className="p-3.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] flex flex-col gap-1.5 shadow-2xs">
                  <div className="text-xs font-bold text-[var(--text-primary)]">{d.full}</div>
                  <div className="flex flex-wrap gap-1">
                    {dayRanges.map((rangeStr, idx) => (
                      <div key={idx} className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/10 w-fit">
                        {rangeStr}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Fast Repeat & 24h Time Selection Desk (Primary Mode) */}
      <section className="sm:p-8 p-6 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] shadow-xs space-y-6">
        <div>
          <h2 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
            <span>⚡</span> Quick 24-Hour Availability & Repeat Scheduler
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Pick your daily hours across any 24h time of day, then choose your recurring days.
          </p>
        </div>

        {/* Step 1: Time of Day Wheel Pickers & Repeat Selector */}
        <div className="flex flex-wrap xl:flex-nowrap items-center justify-center xl:justify-between gap-6 p-6 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border)]">
          <div className="flex flex-col items-center justify-center text-center gap-2.5 shrink-0">
            <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider text-center flex items-center justify-center gap-1.5">
              <span>🔔</span> Start Time
            </label>
            <TimeWheelPicker value={quickStart} onChange={setQuickStart} />
          </div>

          <div className="flex flex-col items-center justify-center text-center gap-2.5 shrink-0">
            <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider text-center flex items-center justify-center gap-1.5">
              <span>🚪</span> End Time
            </label>
            <TimeWheelPicker value={quickEnd} onChange={setQuickEnd} />
          </div>

          <div className="flex flex-col justify-end gap-3 min-w-[260px] grow xl:grow-0">
            <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider text-center xl:text-left">
              Repeat Days Schedule
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setRepeatMode("weekdays")}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition ${
                  repeatMode === "weekdays"
                    ? "bg-emerald-500/15 border-emerald-500 text-emerald-600 dark:text-emerald-400"
                    : "bg-[var(--bg-elevated)] border-[var(--border)] text-[var(--text-secondary)] hover:border-emerald-500/40"
                }`}
              >
                Mon – Fri
              </button>

              <button
                type="button"
                onClick={() => setRepeatMode("six_days")}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition ${
                  repeatMode === "six_days"
                    ? "bg-emerald-500/15 border-emerald-500 text-emerald-600 dark:text-emerald-400"
                    : "bg-[var(--bg-elevated)] border-[var(--border)] text-[var(--text-secondary)] hover:border-emerald-500/40"
                }`}
              >
                Mon – Sat
              </button>

              <button
                type="button"
                onClick={() => setRepeatMode("every_day")}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition ${
                  repeatMode === "every_day"
                    ? "bg-emerald-500/15 border-emerald-500 text-emerald-600 dark:text-emerald-400"
                    : "bg-[var(--bg-elevated)] border-[var(--border)] text-[var(--text-secondary)] hover:border-emerald-500/40"
                }`}
              >
                Everyday
              </button>

              <button
                type="button"
                onClick={() => setRepeatMode("custom")}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition ${
                  repeatMode === "custom"
                    ? "bg-emerald-500/15 border-emerald-500 text-emerald-600 dark:text-emerald-400"
                    : "bg-[var(--bg-elevated)] border-[var(--border)] text-[var(--text-secondary)] hover:border-emerald-500/40"
                }`}
              >
                Custom Days ▾
              </button>
            </div>
          </div>
        </div>

        {repeatMode !== "custom" && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-5 border-t border-[var(--border)]">
            <div className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Applying from <strong>{pretty(quickStart)}</strong> to <strong>{pretty(quickEnd)}</strong> on{" "}
              <strong>
                {repeatMode === "weekdays"
                  ? "Monday through Friday"
                  : repeatMode === "six_days"
                    ? "Monday through Saturday"
                    : "Every Single Day"}
              </strong>
            </div>

            <button
              type="button"
              onClick={applyQuickRepeat}
              disabled={saving || loading}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-500 shadow-md hover:shadow-emerald-600/15 transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed select-none shrink-0 cursor-pointer"
            >
              + Apply Repeat Hours
            </button>
          </div>
        )}
      </section>

      {/* Expandable Custom 24-Hour Weekly Grid (Only opens when Custom is selected) */}
      {repeatMode === "custom" && (
        <section className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] shadow-sm overflow-hidden animate-fadeIn">
          <div className="px-6 py-4 border-b border-[var(--border)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-[var(--text-primary)]">
                24/7 Custom Weekly Time Matrix (00:00 – 23:30)
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Click any box to mark available with YouTube-style like animation. Click a day header to toggle that entire day.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-md bg-emerald-500 shadow-xs inline-block animate-youtube-like" />
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                Green = Available
              </span>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[600px]">
            <table className="w-full border-collapse min-w-[700px]">
              <thead className="sticky top-0 z-20 bg-[var(--bg-elevated)] border-b border-[var(--border)] shadow-xs">
                <tr>
                  <th className="p-3 text-left text-xs font-bold text-[var(--text-tertiary)] w-28 sticky left-0 bg-[var(--bg-elevated)] z-21 border-r border-[var(--border)]">
                    Time (24h)
                  </th>
                  {DAYS.map((d) => {
                    const daySet = selected[d.id] ?? new Set<string>();
                    const count = daySet.size;
                    return (
                      <th
                        key={d.id}
                        onClick={() => toggleDay(d.id)}
                        title={`Click to toggle all 24 hours for ${d.full}`}
                        className="p-2.5 text-center cursor-pointer hover:bg-emerald-500/5 transition border-r border-[var(--border)] select-none"
                      >
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-xs font-bold text-[var(--text-primary)]">{d.short}</span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                              count > 0
                                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                : "text-[var(--text-tertiary)]"
                            }`}
                          >
                            {(count * 0.5).toFixed(1)}h
                          </span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {ALL_CELLS.map((cell, idx) => {
                  const isHour = cell.endsWith(":00");
                  return (
                    <tr
                      key={cell}
                      className={idx % 2 === 0 ? "bg-transparent" : "bg-black/[0.015] dark:bg-white/[0.015]"}
                    >
                      <td className="px-3 py-1.5 text-xs font-mono text-[var(--text-secondary)] whitespace-nowrap sticky left-0 bg-[var(--bg-primary)] border-r border-[var(--border)] z-10">
                        <span className={isHour ? "font-bold text-[var(--text-primary)]" : "text-[var(--text-tertiary)]"}>
                          {pretty(cell)}
                        </span>
                      </td>

                      {DAYS.map((d) => {
                        const on = selected[d.id]?.has(cell) ?? false;
                        return (
                          <td
                            key={d.id}
                            onMouseDown={() => {
                              setDragging(!on);
                              setCell(d.id, cell, !on);
                            }}
                            onMouseEnter={() => {
                              if (dragging !== null) setCell(d.id, cell, dragging);
                            }}
                            className="p-1 border-r border-[var(--border)] cursor-pointer select-none"
                          >
                            <div
                              className={`h-6 rounded-md transition-all duration-150 transform ${
                                on
                                  ? "bg-emerald-500 shadow-sm border border-emerald-400 scale-100 ring-1 ring-emerald-500/30 animate-youtube-like"
                                  : "bg-transparent hover:bg-emerald-500/15 scale-95 border border-transparent"
                              }`}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Save Button */}
      <div className="flex items-center gap-4 pt-4">
        <button
          type="button"
          onClick={save}
          disabled={saving || loading || gridLocked}
          className="px-6 py-3 rounded-xl text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-500 shadow-md hover:shadow-emerald-500/25 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Saving…" : onboarding ? "Save & Finish" : "Save Availability Hours"}
        </button>
        <span className="text-xs text-[var(--text-secondary)]">
          💡 Click & drag across boxes to paint hours. Click any day column to toggle all 24 hours.
        </span>
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
   WHEEL TIME PICKER COMPONENT (3D PERSPECTIVE SYSTEM)
   ═════════════════════════════════════════════════════════════════════════════ */

interface WheelColumnProps {
  items: string[];
  value: string;
  onChange: (value: string) => void;
}

function WheelColumn({ items, value, onChange }: WheelColumnProps) {
  const [scrollTop, setScrollTop] = useState(0);
  const itemHeight = 36; // 36px item height matches CSS h-9
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isProgrammaticRef = useRef(false);
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (node) {
      const idx = items.indexOf(value);
      if (idx !== -1) {
        const expected = idx * itemHeight;
        if (Math.abs(node.scrollTop - expected) > 2) {
          isProgrammaticRef.current = true;
          node.scrollTop = expected;
          if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
          lockTimerRef.current = setTimeout(() => {
            isProgrammaticRef.current = false;
          }, 150);
        }
      }
    }
  }, [value, items]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const currentScrollTop = container.scrollTop;
    setScrollTop(currentScrollTop);

    if (isProgrammaticRef.current) return;

    const index = Math.round(currentScrollTop / itemHeight);
    if (index >= 0 && index < items.length) {
      const activeValue = items[index];
      if (activeValue && activeValue !== value) {
        onChange(activeValue);
      }
    }
  };

  return (
    <div
      className="relative w-16 h-32 overflow-hidden select-none bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl"
      style={{ perspective: "600px" }}
    >
      {/* Top and Bottom gradient overlays to fade out items */}
      <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-[var(--bg-elevated)] to-transparent pointer-events-none z-10" />
      <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[var(--bg-elevated)] to-transparent pointer-events-none z-10" />

      {/* Selected item highlight border lines */}
      <div className="absolute top-1/2 left-0 right-0 h-9 -translate-y-1/2 border-y border-emerald-500/20 bg-emerald-500/5 pointer-events-none z-10" />

      {/* Scrollable list */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="w-full h-full overflow-y-scroll snap-y snap-mandatory scrollbar-none"
        style={{ scrollbarWidth: "none", transformStyle: "preserve-3d" }}
      >
        <div
          className="pt-[46px] pb-[46px]" // (128px container height - 36px item height) / 2 = 46px
          style={{ transformStyle: "preserve-3d" }}
        >
          {items.map((item, idx) => {
            const offset = (idx * itemHeight - scrollTop) / itemHeight;
            const angle = offset * 24; // cylinder rotation angle
            const opacity = Math.max(0.15, 1 - Math.min(0.85, Math.abs(offset) * 0.4));
            const scale = Math.max(0.75, 1.2 - Math.min(0.45, Math.abs(offset) * 0.18));
            const translateZ = Math.abs(offset) * -12; // push back
            const isCurrent = item === value;

            return (
              <button
                key={item}
                type="button"
                onClick={() => {
                  if (item !== value) {
                    onChange(item);
                  }
                }}
                className="h-9 w-full flex items-center justify-center text-xs font-bold snap-center transition-all duration-75 select-none cursor-pointer"
                style={{
                  transform: `rotateX(${angle}deg) scale(${scale}) translateZ(${translateZ}px)`,
                  opacity: isCurrent ? 1 : opacity,
                  transformStyle: "preserve-3d",
                  color: isCurrent || Math.abs(offset) < 0.4 ? "var(--text-primary)" : "var(--text-tertiary)",
                  background: "transparent",
                  border: "none",
                  padding: 0,
                }}
              >
                {item}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface TimeWheelPickerProps {
  value: string; // "HH:MM" e.g., "14:30"
  onChange: (value: string) => void;
}

const HOURS = ["12", "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11"];
const MINUTES = ["00", "30"];
const PERIODS = ["AM", "PM"];

function TimeWheelPicker({ value, onChange }: TimeWheelPickerProps) {
  const { hour12, minute, ampm } = useMemo(() => {
    const [hStr, mStr] = value.split(":");
    const h = parseInt(hStr || "0", 10);
    const m = parseInt(mStr || "0", 10);
    const p = h >= 12 ? "PM" : "AM";
    let h12 = h % 12;
    if (h12 === 0) h12 = 12;
    const h12Str = String(h12).padStart(2, "0");
    const mStrNew = String(m).padStart(2, "0");
    return { hour12: h12Str, minute: mStrNew, ampm: p };
  }, [value]);

  const updateVal = (h12: string, min: string, p: string) => {
    let h = parseInt(h12, 10);
    const m = parseInt(min, 10);
    if (p === "PM" && h < 12) h += 12;
    if (p === "AM" && h === 12) h = 0;
    const formatted = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    onChange(formatted);
  };

  return (
    <div className="flex items-center gap-1.5 p-3.5 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] shadow-xs relative">
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="sr-only"
        aria-label="Select Time"
      />
      <style dangerouslySetInnerHTML={{ __html: `
        .scrollbar-none::-webkit-scrollbar {
          display: none;
        }
      ` }} />
      <WheelColumn items={HOURS} value={hour12} onChange={(h) => updateVal(h, minute, ampm)} />
      <div className="text-base font-bold text-[var(--text-secondary)] self-center px-1">:</div>
      <WheelColumn items={MINUTES} value={minute} onChange={(m) => updateVal(hour12, m, ampm)} />
      <div className="w-1.5" />
      <WheelColumn items={PERIODS} value={ampm} onChange={(p) => updateVal(hour12, minute, p)} />
    </div>
  );
}

