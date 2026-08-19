"use client";

/**
 * Book a trial class.
 *
 * Replaces a mock that had hardcoded teacher names and a setTimeout where the
 * network call should have been — and which was linked from the sidebar, the
 * mobile tab bar and the dashboard, so students could already press a button
 * that pretended to work.
 *
 * ── Times ───────────────────────────────────────────────────────────────────
 * Every slot arrives as an absolute instant and is rendered through
 * `LocalTime`, so it lands in the viewer's own zone with no arithmetic here.
 * Underneath each one we also show the teacher's hour: a family should be able
 * to see that the person teaching them is awake, and a mis-entered teacher
 * zone shows up as an obviously silly number rather than as a no-show three
 * weeks later.
 *
 * No prices anywhere on this page — see lib/pricing-visibility.ts.
 */

import { useEffect, useMemo, useState } from "react";
import LocalTime, { formatInZone, useViewerTimeZone } from "@/components/LocalTime";

interface Teacher {
  id: string;
  name: string | null;
  image: string | null;
  timezone: string | null;
}

interface Slot {
  teacherId: string;
  teacherName: string;
  teacherTimeZone: string;
  startsAt: string;
  endsAt: string;
}

export default function BookingPage() {
  const viewerZone = useViewerTimeZone();

  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [teacherId, setTeacherId] = useState<string>("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [dayKey, setDayKey] = useState<string>("");
  const [chosen, setChosen] = useState<Slot | null>(null);

  const [loadingTeachers, setLoadingTeachers] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [booking, setBooking] = useState(false);
  const [done, setDone] = useState<Slot | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/teachers");
        if (!res.ok) throw new Error("Couldn't load teachers.");
        const data = (await res.json()) as { teachers: Teacher[] };
        setTeachers(data.teachers);
        if (data.teachers.length === 1) setTeacherId(data.teachers[0].id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        setLoadingTeachers(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!teacherId) {
      setSlots([]);
      return;
    }
    let cancelled = false;
    setLoadingSlots(true);
    setChosen(null);
    (async () => {
      try {
        const res = await fetch(`/api/availability/slots?teacherId=${encodeURIComponent(teacherId)}&days=14`);
        if (!res.ok) throw new Error("Couldn't load available times.");
        const data = (await res.json()) as { slots: Slot[] };
        if (cancelled) return;
        setSlots(data.slots);
        setDayKey("");
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        if (!cancelled) setLoadingSlots(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [teacherId]);

  /**
   * Group by the viewer's calendar day, not by UTC's. A 7:30 PM Chicago class
   * is already "tomorrow" in UTC, and a student should not be offered
   * Wednesday's slot under Thursday's heading.
   */
  const byDay = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of slots) {
      const key = formatInZone(s.startsAt, "full-date", false, viewerZone || undefined);
      const list = map.get(key) ?? [];
      list.push(s);
      map.set(key, list);
    }
    return map;
  }, [slots, viewerZone]);

  const dayKeys = useMemo(() => [...byDay.keys()], [byDay]);
  const activeDay = dayKey || dayKeys[0] || "";
  const daySlots = byDay.get(activeDay) ?? [];

  async function confirm() {
    if (!chosen) return;
    setBooking(true);
    setError("");
    try {
      const res = await fetch("/api/trials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherId: chosen.teacherId, startsAt: chosen.startsAt }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "We couldn't book that time.");
      setDone(chosen);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      // The slot may have gone while they were deciding. Refresh so the grid
      // stops offering something that is no longer there.
      setChosen(null);
      if (teacherId) {
        fetch(`/api/availability/slots?teacherId=${encodeURIComponent(teacherId)}&days=14`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => d && setSlots(d.slots))
          .catch(() => {});
      }
    } finally {
      setBooking(false);
    }
  }

  const card: React.CSSProperties = {
    border: "1px solid var(--border)",
    borderRadius: "14px",
    padding: "18px",
    background: "var(--bg-elevated)",
  };

  if (done) {
    return (
      <div style={{ padding: "32px 16px", maxWidth: "560px", margin: "0 auto", textAlign: "center" }}>
        <div style={{ fontSize: "44px", marginBottom: "12px" }}>🌙</div>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 8px" }}>
          Your trial class is booked
        </h1>
        <p style={{ fontSize: "16px", color: "var(--text-primary)", margin: "0 0 4px" }}>
          <LocalTime iso={done.startsAt} mode="date-time" withZone />
        </p>
        <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginTop: 0 }}>
          with {done.teacherName}
        </p>
        <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginTop: "20px", lineHeight: 1.6 }}>
          We&apos;ve emailed your teacher. You&apos;ll find the class on your schedule, and
          the Join button appears shortly before it starts.
        </p>
        <a
          href="/dashboard/schedule"
          style={{
            display: "inline-block",
            marginTop: "20px",
            padding: "11px 22px",
            borderRadius: "10px",
            background: "var(--accent)",
            color: "#fff",
            textDecoration: "none",
            fontWeight: 600,
            fontSize: "15px",
          }}
        >
          See my schedule
        </a>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 16px", maxWidth: "760px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        Book a trial class
      </h1>
      <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginTop: "4px" }}>
        Half an hour, one to one, no charge.
        {viewerZone && ` All times shown in ${viewerZone.replace("_", " ")}.`}
      </p>

      {error && (
        <div
          style={{
            margin: "16px 0",
            padding: "11px 14px",
            borderRadius: "10px",
            background: "#fee2e2",
            color: "#991b1b",
            fontSize: "14px",
          }}
        >
          {error}
        </div>
      )}

      {/* 1 — teacher */}
      <section style={{ ...card, marginTop: "20px" }}>
        <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", margin: "0 0 12px" }}>
          1. Choose a teacher
        </h2>
        {loadingTeachers ? (
          <p style={{ color: "var(--text-tertiary)", fontSize: "14px", margin: 0 }}>Loading…</p>
        ) : teachers.length === 0 ? (
          <p style={{ color: "var(--text-tertiary)", fontSize: "14px", margin: 0 }}>
            No teachers are taking bookings yet. Please check back shortly.
          </p>
        ) : (
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {teachers.map((t) => (
              <button
                key={t.id}
                onClick={() => setTeacherId(t.id)}
                style={{
                  padding: "10px 16px",
                  borderRadius: "10px",
                  border: `1px solid ${teacherId === t.id ? "var(--accent)" : "var(--border)"}`,
                  background: teacherId === t.id ? "var(--accent)" : "transparent",
                  color: teacherId === t.id ? "#fff" : "var(--text-primary)",
                  fontSize: "14px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                {t.name || "Teacher"}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* 2 — day and time */}
      {teacherId && (
        <section style={{ ...card, marginTop: "16px" }}>
          <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", margin: "0 0 12px" }}>
            2. Pick a time
          </h2>

          {loadingSlots ? (
            <p style={{ color: "var(--text-tertiary)", fontSize: "14px", margin: 0 }}>
              Finding open times…
            </p>
          ) : slots.length === 0 ? (
            <p style={{ color: "var(--text-tertiary)", fontSize: "14px", margin: 0 }}>
              This teacher has no open times in the next two weeks.
            </p>
          ) : (
            <>
              <div style={{ display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "10px" }}>
                {dayKeys.map((k) => (
                  <button
                    key={k}
                    onClick={() => {
                      setDayKey(k);
                      setChosen(null);
                    }}
                    style={{
                      padding: "8px 14px",
                      borderRadius: "9px",
                      whiteSpace: "nowrap",
                      border: `1px solid ${k === activeDay ? "var(--accent)" : "var(--border)"}`,
                      background: k === activeDay ? "var(--accent)" : "transparent",
                      color: k === activeDay ? "#fff" : "var(--text-secondary)",
                      fontSize: "13px",
                      cursor: "pointer",
                    }}
                  >
                    {k}
                  </button>
                ))}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                  gap: "10px",
                  marginTop: "10px",
                }}
              >
                {daySlots.map((s) => {
                  const active = chosen?.startsAt === s.startsAt;
                  return (
                    <button
                      key={s.startsAt}
                      onClick={() => setChosen(s)}
                      style={{
                        padding: "11px 12px",
                        borderRadius: "10px",
                        textAlign: "left",
                        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                        background: active ? "var(--accent)" : "transparent",
                        color: active ? "#fff" : "var(--text-primary)",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ fontSize: "15px", fontWeight: 600 }}>
                        <LocalTime iso={s.startsAt} mode="time" />
                      </div>
                      <div
                        style={{
                          fontSize: "11.5px",
                          marginTop: "3px",
                          color: active ? "rgba(255,255,255,0.85)" : "var(--text-tertiary)",
                        }}
                      >
                        {formatInZone(s.startsAt, "time", false, s.teacherTimeZone)} for your teacher
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </section>
      )}

      {/* 3 — confirm */}
      {chosen && (
        <section style={{ ...card, marginTop: "16px" }}>
          <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", margin: "0 0 10px" }}>
            3. Confirm
          </h2>
          <p style={{ fontSize: "15px", color: "var(--text-primary)", margin: "0 0 4px" }}>
            <LocalTime iso={chosen.startsAt} mode="date-time" withZone /> with {chosen.teacherName}
          </p>
          <p style={{ fontSize: "13px", color: "var(--text-tertiary)", marginTop: 0 }}>
            30 minutes · that&apos;s{" "}
            {formatInZone(chosen.startsAt, "weekday-time", false, chosen.teacherTimeZone)} where
            they are
          </p>
          <button
            onClick={confirm}
            disabled={booking}
            style={{
              marginTop: "14px",
              padding: "12px 24px",
              borderRadius: "10px",
              border: "none",
              background: "var(--accent)",
              color: "#fff",
              fontSize: "15px",
              fontWeight: 600,
              cursor: booking ? "not-allowed" : "pointer",
              opacity: booking ? 0.6 : 1,
            }}
          >
            {booking ? "Booking…" : "Book this trial class"}
          </button>
        </section>
      )}
    </div>
  );
}
