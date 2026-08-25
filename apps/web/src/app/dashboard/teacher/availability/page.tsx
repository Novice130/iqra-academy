"use client";

/**
 * The teacher's weekly hours — 24/7 Around-the-Clock availability editor.
 *
 * ── Features ─────────────────────────────────────────────────────────────────
 * - 24/7 round-the-clock selection (00:00 to 23:30 across 48 half-hour slots).
 * - Empty default state (unselected by default; only selected slots turn blue).
 * - Quick Period Filter Pills: All 24h, Morning, Afternoon, Evening, Night.
 * - 1-Click Presets: "Weekdays 9am–5pm", "Weekdays 5pm–10pm", "Weekends", "Clear All".
 * - Clickable Day Column headers to toggle/fill/clear entire days.
 * - Timezone validation with instant multi-city preview strip.
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

/** Full 24 hours: 00:00 through 23:30 (48 half-hour slots per day) */
const ALL_CELLS: string[] = [];
for (let m = 0; m < 24 * 60; m += SLOT_MINUTES) {
  ALL_CELLS.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
}

type PeriodFilter = "all" | "morning" | "afternoon" | "evening" | "night";

const PERIODS: { id: PeriodFilter; label: string; range: string; filter: (t: string) => boolean }[] = [
  {
    id: "all",
    label: "All 24 Hours",
    range: "12:00 AM – 11:30 PM",
    filter: () => true,
  },
  {
    id: "morning",
    label: "🌅 Morning",
    range: "06:00 AM – 12:00 PM",
    filter: (t) => {
      const m = toMinutes(t);
      return m >= 6 * 60 && m < 12 * 60;
    },
  },
  {
    id: "afternoon",
    label: "☀️ Afternoon",
    range: "12:00 PM – 05:00 PM",
    filter: (t) => {
      const m = toMinutes(t);
      return m >= 12 * 60 && m < 17 * 60;
    },
  },
  {
    id: "evening",
    label: "🌆 Evening",
    range: "05:00 PM – 10:00 PM",
    filter: (t) => {
      const m = toMinutes(t);
      return m >= 17 * 60 && m < 22 * 60;
    },
  },
  {
    id: "night",
    label: "🌙 Night / Early",
    range: "10:00 PM – 06:00 AM",
    filter: (t) => {
      const m = toMinutes(t);
      return m >= 22 * 60 || m < 6 * 60;
    },
  },
];

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

/** Converts wall-clock in fromZone to preview in toZone */
function inOtherZone(hhmm: string, fromZone: string, toZone: string, weekdayIndex: number): string {
  try {
    const now = new Date();
    const probe = new Date(now.getTime());
    probe.setUTCDate(probe.getUTCDate() + ((weekdayIndex + 8 - probe.getUTCDay()) % 7 || 7));
    const [h, m] = hhmm.split(":").map(Number);

    const naive = Date.UTC(probe.getUTCFullYear(), probe.getUTCMonth(), probe.getUTCDate(), h, m);
    const offsetAt = (instant: number, zoneName: string) => {
      const f = new Intl.DateTimeFormat("en-US", {
        timeZone: zoneName,
        hour12: false,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      const p: Record<string, string> = {};
      for (const part of f.formatToParts(new Date(instant))) p[part.type] = part.value;
      const hr = p.hour === "24" ? "00" : p.hour;
      return Date.UTC(+p.year, +p.month - 1, +p.day, +hr, +p.minute, +p.second) - instant;
    };
    const guess = naive - offsetAt(naive, fromZone);
    const instant = naive - offsetAt(guess, fromZone);

    return new Intl.DateTimeFormat("en-US", {
      timeZone: toZone,
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(instant));
  } catch {
    return "—";
  }
}

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
  const [activePeriod, setActivePeriod] = useState<PeriodFilter>("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const qs = teacherId ? `?teacherId=${encodeURIComponent(teacherId)}` : "";
        const res = await fetch(`/api/teachers/availability${qs}`);
        if (!res.ok) throw new Error("Could not load your hours.");
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
  }, []);

  const applyPreset = useCallback((preset: "weekdays-day" | "weekdays-eve" | "weekends" | "all-247") => {
    setSelected((prev) => {
      const next: Record<string, Set<string>> = { ...prev };
      const weekdayIds = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
      const weekendIds = ["SATURDAY", "SUNDAY"];

      if (preset === "weekdays-day") {
        for (const day of weekdayIds) {
          const set = new Set(next[day] ?? []);
          for (let m = 9 * 60; m < 17 * 60; m += SLOT_MINUTES) set.add(fromMinutes(m));
          next[day] = set;
        }
      } else if (preset === "weekdays-eve") {
        for (const day of weekdayIds) {
          const set = new Set(next[day] ?? []);
          for (let m = 17 * 60; m < 22 * 60; m += SLOT_MINUTES) set.add(fromMinutes(m));
          next[day] = set;
        }
      } else if (preset === "weekends") {
        for (const day of weekendIds) {
          const set = new Set(next[day] ?? []);
          for (let m = 10 * 60; m < 18 * 60; m += SLOT_MINUTES) set.add(fromMinutes(m));
          next[day] = set;
        }
      } else if (preset === "all-247") {
        for (const day of DAYS) {
          next[day.id] = new Set(ALL_CELLS);
        }
      }
      return next;
    });
  }, []);

  const toggleDay = useCallback(
    (dayId: string, targetCells: string[]) => {
      setSelected((prev) => {
        const current = prev[dayId] ?? new Set<string>();
        const allVisibleSelected = targetCells.every((c) => current.has(c));
        const nextSet = new Set(current);

        if (allVisibleSelected) {
          targetCells.forEach((c) => nextSet.delete(c));
        } else {
          targetCells.forEach((c) => nextSet.add(c));
        }

        return { ...prev, [dayId]: nextSet };
      });
    },
    []
  );

  const visibleCells = useMemo(() => {
    const period = PERIODS.find((p) => p.id === activePeriod) ?? PERIODS[0];
    return ALL_CELLS.filter(period.filter);
  }, [activePeriod]);

  /** Contiguous ticks become one range */
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

  const previewAnchor = useMemo(() => {
    for (const [i, day] of DAYS.entries()) {
      const cells = [...(selected[day.id] ?? [])].sort();
      if (cells.length > 0) return { day, cell: cells[0], weekdayIndex: (i + 1) % 7 };
    }
    return null;
  }, [selected]);

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
      setNote({ text: "Saved. Students will see these hours in their own local time.", bad: false });
    } catch (err) {
      setNote({ text: err instanceof Error ? err.message : "Save failed.", bad: true });
    } finally {
      setSaving(false);
    }
  }

  const gridLocked = !zoneConfirmed;

  return (
    <div
      style={{ padding: "24px 16px", maxWidth: "1160px" }}
      onMouseUp={() => setDragging(null)}
      onMouseLeave={() => setDragging(null)}
    >
      <div style={{ marginBottom: "20px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
          {teacherId ? "Their weekly hours" : "Your weekly hours"}
        </h1>
        <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginTop: "4px" }}>
          {totalCells === 0
            ? "No availability selected — grid is empty. Click and drag or use presets below."
            : `${totalHours.toFixed(1)} hrs selected (${totalCells} half-hour slots across ${ranges.length} time blocks)`}
        </p>
      </div>

      {/* Timezone verification */}
      <div
        style={{
          border: `1px solid ${zoneConfirmed ? "var(--border)" : "#f59e0b"}`,
          borderRadius: "12px",
          padding: "16px",
          marginBottom: "20px",
          background: "var(--bg-elevated)",
        }}
      >
        <div style={{ fontSize: "14px", color: "var(--text-primary)", marginBottom: "10px" }}>
          You are setting times in{" "}
          <strong>{ZONES.find((z) => z.id === zone)?.label ?? zone}</strong>.
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
          <select
            value={ZONES.some((z) => z.id === zone) ? zone : ""}
            onChange={(e) => {
              if (e.target.value) {
                setZone(e.target.value);
                setZoneConfirmed(false);
              }
            }}
            style={{
              padding: "9px 12px",
              borderRadius: "8px",
              border: "1px solid var(--border)",
              background: "var(--bg-secondary)",
              color: "var(--text-primary)",
              fontSize: "14px",
            }}
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
              onClick={() => setZoneConfirmed(true)}
              style={{
                padding: "9px 16px",
                borderRadius: "8px",
                border: "none",
                background: "var(--accent)",
                color: "#fff",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              That&apos;s right — continue
            </button>
          )}
        </div>
        <p style={{ fontSize: "12.5px", color: "var(--text-tertiary)", marginTop: "10px", marginBottom: 0 }}>
          Students worldwide see these hours converted to their own local time around the clock.
        </p>
      </div>

      {note && (
        <div
          style={{
            marginBottom: "16px",
            padding: "11px 14px",
            borderRadius: "10px",
            fontSize: "14px",
            background: note.bad ? "#fee2e2" : "#dcfce7",
            color: note.bad ? "#991b1b" : "#166534",
          }}
        >
          {note.text}
        </div>
      )}

      {previewAnchor && zone && (
        <div
          style={{
            marginBottom: "16px",
            padding: "12px 14px",
            borderRadius: "10px",
            background: "var(--bg-secondary)",
            fontSize: "13px",
            color: "var(--text-secondary)",
            lineHeight: 1.7,
          }}
        >
          <strong style={{ color: "var(--text-primary)" }}>
            Your {previewAnchor.day.short} {pretty(previewAnchor.cell)}
          </strong>{" "}
          is{" "}
          {["America/Chicago", "America/New_York", "Europe/London", "Asia/Dubai"]
            .filter((z) => z !== zone)
            .map((z) => `${inOtherZone(previewAnchor.cell, zone, z, previewAnchor.weekdayIndex)} in ${z.split("/")[1].replace("_", " ")}`)
            .join(" · ")}
        </div>
      )}

      {/* Quick Action Presets & Tools Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "12px",
          flexWrap: "wrap",
          marginBottom: "16px",
        }}
      >
        {/* Period Filter Tabs */}
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {PERIODS.map((p) => {
            const active = activePeriod === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setActivePeriod(p.id)}
                style={{
                  padding: "6px 12px",
                  borderRadius: "20px",
                  border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
                  background: active ? "var(--accent)" : "var(--bg-elevated)",
                  color: active ? "#fff" : "var(--text-secondary)",
                  fontSize: "12.5px",
                  fontWeight: active ? 600 : 500,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
                title={p.range}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* 1-Click Quick Fill & Clear Tools */}
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: "12px", color: "var(--text-tertiary)", marginRight: "2px" }}>
            Presets:
          </span>
          <button
            type="button"
            onClick={() => applyPreset("weekdays-day")}
            disabled={gridLocked}
            style={{
              padding: "5px 10px",
              borderRadius: "6px",
              border: "1px solid var(--border)",
              background: "var(--bg-secondary)",
              color: "var(--text-primary)",
              fontSize: "11.5px",
              cursor: gridLocked ? "not-allowed" : "pointer",
            }}
          >
            + Weekdays 9–5
          </button>
          <button
            type="button"
            onClick={() => applyPreset("weekdays-eve")}
            disabled={gridLocked}
            style={{
              padding: "5px 10px",
              borderRadius: "6px",
              border: "1px solid var(--border)",
              background: "var(--bg-secondary)",
              color: "var(--text-primary)",
              fontSize: "11.5px",
              cursor: gridLocked ? "not-allowed" : "pointer",
            }}
          >
            + Weekdays 5–10 PM
          </button>
          <button
            type="button"
            onClick={() => applyPreset("weekends")}
            disabled={gridLocked}
            style={{
              padding: "5px 10px",
              borderRadius: "6px",
              border: "1px solid var(--border)",
              background: "var(--bg-secondary)",
              color: "var(--text-primary)",
              fontSize: "11.5px",
              cursor: gridLocked ? "not-allowed" : "pointer",
            }}
          >
            + Weekends
          </button>
          <button
            type="button"
            onClick={clearAll}
            disabled={gridLocked || totalCells === 0}
            style={{
              padding: "5px 10px",
              borderRadius: "6px",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              background: totalCells > 0 ? "rgba(239, 68, 68, 0.1)" : "var(--bg-secondary)",
              color: totalCells > 0 ? "#ef4444" : "var(--text-tertiary)",
              fontSize: "11.5px",
              fontWeight: 600,
              cursor: gridLocked || totalCells === 0 ? "not-allowed" : "pointer",
            }}
          >
            Clear All
          </button>
        </div>
      </div>

      {/* Main 24-Hour Availability Grid */}
      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: "12px",
          overflow: "hidden",
          opacity: gridLocked ? 0.45 : 1,
          pointerEvents: gridLocked ? "none" : "auto",
          background: "var(--bg-primary)",
        }}
      >
        <div style={{ overflowX: "auto", maxHeight: activePeriod === "all" ? "650px" : "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: "660px" }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
              <tr style={{ background: "var(--bg-elevated)", borderBottom: "1px solid var(--border)" }}>
                <th
                  style={{
                    padding: "10px 12px",
                    fontSize: "12px",
                    color: "var(--text-tertiary)",
                    textAlign: "left",
                    width: "100px",
                    position: "sticky",
                    left: 0,
                    background: "var(--bg-elevated)",
                    zIndex: 11,
                  }}
                >
                  Time
                </th>
                {DAYS.map((d) => {
                  const daySet = selected[d.id] ?? new Set<string>();
                  const visibleSelectedCount = visibleCells.filter((c) => daySet.has(c)).length;
                  const allSelected = visibleSelectedCount === visibleCells.length && visibleCells.length > 0;
                  return (
                    <th
                      key={d.id}
                      onClick={() => toggleDay(d.id, visibleCells)}
                      title={`Click to ${allSelected ? "clear" : "select all in view"} for ${d.full}`}
                      style={{
                        padding: "8px 6px",
                        fontSize: "12.5px",
                        color: "var(--text-primary)",
                        textAlign: "center",
                        cursor: "pointer",
                        userSelect: "none",
                        transition: "background 0.15s ease",
                      }}
                      className="hover:bg-white/5"
                    >
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                        <span>{d.short}</span>
                        <span
                          style={{
                            fontSize: "10px",
                            padding: "1px 5px",
                            borderRadius: "10px",
                            background: visibleSelectedCount > 0 ? "rgba(0, 122, 255, 0.18)" : "transparent",
                            color: visibleSelectedCount > 0 ? "#007aff" : "var(--text-tertiary)",
                            fontWeight: 600,
                          }}
                        >
                          {(visibleSelectedCount * 0.5).toFixed(1)}h
                        </span>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ padding: "48px", textAlign: "center", color: "var(--text-tertiary)" }}>
                    Loading your availability…
                  </td>
                </tr>
              ) : visibleCells.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: "48px", textAlign: "center", color: "var(--text-tertiary)" }}>
                    No slots in this period.
                  </td>
                </tr>
              ) : (
                visibleCells.map((cell, idx) => {
                  const isHour = cell.endsWith(":00");
                  const hourInt = parseInt(cell.split(":")[0], 10);
                  const isPeriodBoundary = isHour && (hourInt === 6 || hourInt === 12 || hourInt === 17 || hourInt === 22);

                  return (
                    <tr
                      key={cell}
                      style={{
                        background: idx % 2 === 0 ? "transparent" : "rgba(255, 255, 255, 0.015)",
                        borderTop: isPeriodBoundary ? "2px solid rgba(0, 122, 255, 0.35)" : isHour ? "1px solid var(--border)" : "1px dashed rgba(255, 255, 255, 0.05)",
                      }}
                    >
                      <td
                        style={{
                          padding: "4px 10px",
                          fontSize: "11px",
                          fontFamily: "monospace",
                          color: isHour ? "var(--text-secondary)" : "var(--text-tertiary)",
                          fontWeight: isHour ? 600 : 400,
                          position: "sticky",
                          left: 0,
                          background: "var(--bg-primary)",
                          whiteSpace: "nowrap",
                          borderRight: "1px solid var(--border)",
                          zIndex: 5,
                        }}
                      >
                        {pretty(cell)}
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
                            style={{
                              borderRight: "1px solid var(--border)",
                              padding: "2px",
                              cursor: "pointer",
                              userSelect: "none",
                            }}
                          >
                            <div
                              style={{
                                height: "22px",
                                borderRadius: "4px",
                                background: on
                                  ? "linear-gradient(135deg, #007aff 0%, #0056d6 100%)"
                                  : "transparent",
                                boxShadow: on ? "0 2px 6px rgba(0, 122, 255, 0.35)" : "none",
                                border: on ? "1px solid rgba(120, 190, 255, 0.5)" : "1px solid transparent",
                                transition: "all 0.12s ease",
                              }}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Save Button & Guidance */}
      <div style={{ display: "flex", gap: "14px", alignItems: "center", marginTop: "20px", flexWrap: "wrap" }}>
        <button
          onClick={save}
          disabled={saving || loading || gridLocked}
          style={{
            padding: "11px 24px",
            borderRadius: "10px",
            border: "none",
            background: "var(--accent)",
            color: "#fff",
            fontSize: "15px",
            fontWeight: 600,
            cursor: saving || gridLocked ? "not-allowed" : "pointer",
            opacity: saving || gridLocked ? 0.55 : 1,
            boxShadow: "0 4px 14px rgba(0, 122, 255, 0.35)",
          }}
        >
          {saving ? "Saving…" : onboarding ? "Save & finish" : "Save hours"}
        </button>
        <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
          💡 <strong>Tip:</strong> Click & drag to paint blocks. Click any day column header (e.g. <em>Mon</em>) to toggle visible hours.
        </span>
      </div>
    </div>
  );
}
