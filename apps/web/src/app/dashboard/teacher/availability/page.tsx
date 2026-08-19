"use client";

/**
 * The teacher's weekly hours.
 *
 * ── The zone is the whole point ─────────────────────────────────────────────
 * The previous version of this screen never asked for a time zone and never
 * sent one, so every row it saved took the database default of
 * America/New_York while the teacher filling it in sat in Asia/Kolkata. The
 * stored hours were not merely unlabelled — they were labelled wrongly, which
 * is worse, because it looks like an answer. So the zone is now the first
 * thing on the page, it is stated in words rather than implied, and the grid
 * stays disabled until it has been confirmed once.
 *
 * ── Ranges, not cells ───────────────────────────────────────────────────────
 * The grid is a 30-minute checkbox grid, but contiguous ticks are coalesced
 * into ranges before saving: 16:00, 16:30, 17:00 becomes one 16:00-17:30 row,
 * not three. lib/slots.ts slices them back into bookable slots per occurrence.
 *
 * ── The preview strip ───────────────────────────────────────────────────────
 * A teacher cannot check their own work here without seeing what a student
 * sees. "Your Monday 6:00 PM is 7:30 AM in Chicago" is where a mis-set zone
 * gets caught, and it costs one Intl call per zone.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ZONES, isValidZone } from "@/lib/zones";

const DAYS = [
  { id: "MONDAY", short: "Mon" },
  { id: "TUESDAY", short: "Tue" },
  { id: "WEDNESDAY", short: "Wed" },
  { id: "THURSDAY", short: "Thu" },
  { id: "FRIDAY", short: "Fri" },
  { id: "SATURDAY", short: "Sat" },
  { id: "SUNDAY", short: "Sun" },
] as const;

const SLOT_MINUTES = 30;

/** 06:00 through 22:30 — wide enough for both a morning and an evening school. */
const GRID_START = 6 * 60;
const GRID_END = 22 * 60 + 30;

const CELLS: string[] = [];
for (let m = GRID_START; m <= GRID_END; m += SLOT_MINUTES) {
  CELLS.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
}

const toMinutes = (t: string) => {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
};
const fromMinutes = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** 14:30 → "2:30 PM", without pulling in a formatting library. */
function pretty(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

/**
 * What a given wall-clock reading in `fromZone` looks like in `toZone`.
 *
 * Anchored on an actual upcoming date rather than "today", because the answer
 * genuinely depends on the date: India has no DST and the US does, so the same
 * pair of zones is an hour apart in July and not in January.
 */
function inOtherZone(hhmm: string, fromZone: string, toZone: string, weekdayIndex: number): string {
  try {
    const now = new Date();
    // Next occurrence of that weekday, so the preview reflects a real date.
    const probe = new Date(now.getTime());
    probe.setUTCDate(probe.getUTCDate() + ((weekdayIndex + 8 - probe.getUTCDay()) % 7 || 7));
    const [h, m] = hhmm.split(":").map(Number);

    // Wall clock in fromZone → instant. Same two-pass trick as lib/slots.ts.
    const naive = Date.UTC(probe.getUTCFullYear(), probe.getUTCMonth(), probe.getUTCDate(), h, m);
    const offsetAt = (instant: number, zone: string) => {
      const f = new Intl.DateTimeFormat("en-US", {
        timeZone: zone, hour12: false,
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      });
      const p: Record<string, string> = {};
      for (const part of f.formatToParts(new Date(instant))) p[part.type] = part.value;
      const hr = p.hour === "24" ? "00" : p.hour;
      return Date.UTC(+p.year, +p.month - 1, +p.day, +hr, +p.minute, +p.second) - instant;
    };
    const guess = naive - offsetAt(naive, fromZone);
    const instant = naive - offsetAt(guess, fromZone);

    return new Intl.DateTimeFormat("en-US", {
      timeZone: toZone, weekday: "short", hour: "numeric", minute: "2-digit",
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
  // An admin can land here for somebody else, from /admin/users.
  const teacherId = searchParams.get("teacherId");
  const onboarding = searchParams.get("onboarding") === "1";

  const [selected, setSelected] = useState<Record<string, Set<string>>>({});
  const [zone, setZone] = useState<string>("");
  const [zoneConfirmed, setZoneConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);
  const [dragging, setDragging] = useState<null | boolean>(null);

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
          // Ranges come back from the API; expand them into grid cells.
          for (let m = toMinutes(s.startTime); m + SLOT_MINUTES <= toMinutes(s.endTime); m += SLOT_MINUTES) {
            set.add(fromMinutes(m));
          }
          map[s.dayOfWeek] = set;
        }
        setSelected(map);

        // A stored zone means this was set deliberately before, so don't make
        // them confirm it again. Otherwise fall back to the browser's guess
        // and require an explicit confirmation — that unconfirmed guess is the
        // exact thing that went wrong last time.
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

  /** Contiguous ticks become one range. */
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

  /** The first tick of the week, for the preview strip. */
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

      // Keep the teacher's own dashboard agreeing with their calendar. Only
      // for their own row — an admin editing someone else must not have their
      // own zone rewritten.
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
      style={{ padding: "24px 16px", maxWidth: "1100px" }}
      onMouseUp={() => setDragging(null)}
      onMouseLeave={() => setDragging(null)}
    >
      <div style={{ marginBottom: "20px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
          {teacherId ? "Their weekly hours" : "Your weekly hours"}
        </h1>
        <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginTop: "4px" }}>
          {totalCells === 0
            ? "Nothing set yet — students can't book until there is."
            : `${totalCells} half-hour slots across ${ranges.length} blocks`}
        </p>
      </div>

      {/* The zone comes first, and says so in words. */}
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
          Students always see these hours converted to their own local time. You never
          have to do the maths.
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
          {["America/Chicago", "America/New_York", "Europe/London"]
            .filter((z) => z !== zone)
            .map((z) => `${inOtherZone(previewAnchor.cell, zone, z, previewAnchor.weekdayIndex)} in ${z.split("/")[1].replace("_", " ")}`)
            .join(" · ")}
        </div>
      )}

      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: "12px",
          overflow: "hidden",
          opacity: gridLocked ? 0.45 : 1,
          pointerEvents: gridLocked ? "none" : "auto",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: "620px" }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                <th
                  style={{
                    padding: "10px",
                    fontSize: "12px",
                    color: "var(--text-tertiary)",
                    textAlign: "left",
                    width: "84px",
                    position: "sticky",
                    left: 0,
                    background: "var(--bg-elevated)",
                  }}
                >
                  Time
                </th>
                {DAYS.map((d) => (
                  <th
                    key={d.id}
                    style={{ padding: "10px", fontSize: "12px", color: "var(--text-primary)" }}
                  >
                    {d.short}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ padding: "48px", textAlign: "center", color: "var(--text-tertiary)" }}>
                    Loading…
                  </td>
                </tr>
              ) : (
                CELLS.map((cell) => (
                  <tr key={cell}>
                    <td
                      style={{
                        padding: "4px 10px",
                        fontSize: "11.5px",
                        fontFamily: "monospace",
                        color: "var(--text-tertiary)",
                        borderTop: "1px solid var(--border)",
                        position: "sticky",
                        left: 0,
                        background: "var(--bg-primary)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {cell.endsWith(":00") ? pretty(cell) : ""}
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
                            borderTop: "1px solid var(--border)",
                            borderLeft: "1px solid var(--border)",
                            padding: "2px",
                            cursor: "pointer",
                            userSelect: "none",
                          }}
                        >
                          <div
                            style={{
                              height: "22px",
                              borderRadius: "5px",
                              background: on ? "var(--accent)" : "transparent",
                            }}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: "flex", gap: "12px", alignItems: "center", marginTop: "18px", flexWrap: "wrap" }}>
        <button
          onClick={save}
          disabled={saving || loading || gridLocked}
          style={{
            padding: "11px 22px",
            borderRadius: "10px",
            border: "none",
            background: "var(--accent)",
            color: "#fff",
            fontSize: "15px",
            fontWeight: 600,
            cursor: saving || gridLocked ? "not-allowed" : "pointer",
            opacity: saving || gridLocked ? 0.55 : 1,
          }}
        >
          {saving ? "Saving…" : onboarding ? "Save & finish" : "Save hours"}
        </button>
        <span style={{ fontSize: "12.5px", color: "var(--text-tertiary)" }}>
          Click and drag to paint a block.
        </span>
      </div>
    </div>
  );
}
