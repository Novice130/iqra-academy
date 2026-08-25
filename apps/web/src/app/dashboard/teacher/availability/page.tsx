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

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
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

/** 14:30 → "2:30 PM" */
function pretty(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
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
  const searchParams = useSearchParams();
  const teacherId = searchParams.get("teacherId");
  const onboarding = searchParams.get("onboarding") === "1";

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
          timezone: string | null;
          slots: ApiSlot[];
        };
        if (cancelled) return;

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
          setZoneConfirmed(false);
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
        const set = new Set(next[d.id] ?? []);
        for (const s of slotsToAdd) set.add(s);
        next[d.id] = set;
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
    } catch (err) {
      setNote({ text: err instanceof Error ? err.message : "Save failed.", bad: true });
    } finally {
      setSaving(false);
    }
  }

  const gridLocked = !zoneConfirmed;

  return (
    <div
      className="space-y-6 animate-fadeIn pb-12 max-w-6xl"
      onMouseUp={() => setDragging(null)}
      onMouseLeave={() => setDragging(null)}
    >
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
            disabled={gridLocked || totalCells === 0}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 hover:bg-red-500/20 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Clear All
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || loading || gridLocked}
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

      {/* Fast Repeat & 24h Time Selection Desk (Primary Mode) */}
      <section className="p-6 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] shadow-xs space-y-5">
        <div>
          <h2 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
            <span>⚡</span> Quick 24-Hour Availability & Repeat Scheduler
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Pick your daily hours across any 24h time of day, then choose your recurring days.
          </p>
        </div>

        {/* Step 1: Time of Day Selector */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)]">
          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
              Start Time (24h)
            </label>
            <select
              value={quickStart}
              onChange={(e) => setQuickStart(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-sm font-medium text-[var(--text-primary)]"
            >
              {ALL_CELLS.map((c) => (
                <option key={c} value={c}>
                  {pretty(c)} ({c})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
              End Time (24h)
            </label>
            <select
              value={quickEnd}
              onChange={(e) => setQuickEnd(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-sm font-medium text-[var(--text-primary)]"
            >
              {ALL_CELLS.map((c) => (
                <option key={c} value={c}>
                  {pretty(c)} ({c})
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-2 flex flex-col justify-end">
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
              Repeat Days Schedule
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setRepeatMode("weekdays")}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border transition ${
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
                className={`px-3 py-2 rounded-xl text-xs font-semibold border transition ${
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
                className={`px-3 py-2 rounded-xl text-xs font-semibold border transition ${
                  repeatMode === "every_day"
                    ? "bg-emerald-500/15 border-emerald-500 text-emerald-600 dark:text-emerald-400"
                    : "bg-[var(--bg-elevated)] border-[var(--border)] text-[var(--text-secondary)] hover:border-emerald-500/40"
                }`}
              >
                Mon – Sun (7d)
              </button>

              <button
                type="button"
                onClick={() => setRepeatMode("custom")}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border transition ${
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
          <div className="flex items-center justify-between pt-2">
            <div className="text-xs text-[var(--text-secondary)]">
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
              disabled={gridLocked}
              className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-500 shadow-sm transition active:scale-95 disabled:opacity-50"
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
