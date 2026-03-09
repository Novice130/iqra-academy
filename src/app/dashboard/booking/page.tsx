"use client";

/**
 * Booking Page — 3-step class booking wizard
 *
 * Clean, minimal step flow: Track → Date → Time Slot → Confirm.
 */

import { useState } from "react";

const TRACKS = [
  { id: "QAIDAH", name: "Qaidah", desc: "Learn Arabic letters and sounds" },
  { id: "QURAN_READING", name: "Quran Reading", desc: "Tajweed rules and recitation" },
  { id: "HIFZ", name: "Hifz", desc: "Memorization with guided repetition" },
];

const SLOTS = [
  { time: "9:00 AM", teacher: "Ustadh Ali Rahman", open: true },
  { time: "10:00 AM", teacher: "Ustadha Maryam Khan", open: true },
  { time: "11:30 AM", teacher: "Ustadh Ali Rahman", open: false },
  { time: "2:00 PM", teacher: "Ustadha Maryam Khan", open: true },
  { time: "4:00 PM", teacher: "Ustadh Ali Rahman", open: true },
  { time: "7:00 PM", teacher: "Ustadha Maryam Khan", open: false },
];

export default function BookingPage() {
  const [track, setTrack] = useState("QAIDAH");
  const [day, setDay] = useState(0);
  const [slot, setSlot] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return {
      short: d.toLocaleDateString("en-US", { weekday: "short" }),
      date: d.getDate(),
      month: d.toLocaleDateString("en-US", { month: "short" }),
    };
  });

  const handleBook = async () => {
    if (!slot) return;
    setLoading(true);
    await new Promise(r => setTimeout(r, 1200));
    setLoading(false);
    setDone(true);
    setTimeout(() => setDone(false), 4000);
    setSlot(null);
  };

  return (
    <div className="p-6 lg:p-10 max-w-3xl">
      <div className="mb-10">
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Book a Class
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
          Choose your track, date, and time
        </p>
      </div>

      {/* Success */}
      {done && (
        <div className="card p-4 mb-6 animate-in flex items-center gap-3" style={{
          background: "var(--accent-light)", border: `1px solid ${`rgba(10,137,103,0.15)`}`
        }}>
          <svg className="w-5 h-5 shrink-0" style={{ color: "var(--accent)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-medium" style={{ color: "var(--accent)" }}>
            Class booked successfully!
          </span>
        </div>
      )}

      {/* Step 1: Track */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--text-tertiary)" }}>
          1 · Track
        </h2>
        <div className="grid sm:grid-cols-3 gap-3">
          {TRACKS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTrack(t.id)}
              className="card p-4 text-left transition-all"
              style={track === t.id ? { borderColor: "var(--accent)", boxShadow: "0 0 0 1px var(--accent)" } : {}}
            >
              <div className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>{t.name}</div>
              <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>{t.desc}</div>
            </button>
          ))}
        </div>
      </section>

      {/* Step 2: Date */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--text-tertiary)" }}>
          2 · Date
        </h2>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {days.map((d, i) => (
            <button
              key={i}
              onClick={() => { setDay(i); setSlot(null); }}
              className="flex flex-col items-center min-w-[56px] py-3 px-1 rounded-xl transition-all"
              style={day === i
                ? { background: "var(--accent)", color: "#fff" }
                : { background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)" }
              }
            >
              <span className="text-[10px] font-medium uppercase">{d.short}</span>
              <span className="text-lg font-bold mt-0.5">{d.date}</span>
              <span className="text-[10px]">{d.month}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Step 3: Time */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--text-tertiary)" }}>
          3 · Available Slots
        </h2>
        <div className="space-y-2">
          {SLOTS.map((s) => (
            <button
              key={s.time}
              onClick={() => s.open && setSlot(s.time)}
              disabled={!s.open}
              className="card w-full p-4 text-left flex items-center gap-4 transition-all"
              style={
                slot === s.time
                  ? { borderColor: "var(--accent)", boxShadow: "0 0 0 1px var(--accent)" }
                  : !s.open
                    ? { opacity: 0.4, cursor: "not-allowed" }
                    : {}
              }
            >
              <div className="flex-1">
                <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{s.time}</div>
                <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>{s.teacher} · 30 min</div>
              </div>
              {s.open ? (
                slot === s.time ? (
                  <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "var(--accent)" }}>
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                ) : (
                  <div className="w-5 h-5 rounded-full" style={{ border: "2px solid var(--border)" }} />
                )
              ) : (
                <span className="text-[11px] font-medium" style={{ color: "var(--text-tertiary)" }}>Booked</span>
              )}
            </button>
          ))}
        </div>
      </section>

      {/* Confirm */}
      <div className="flex justify-end">
        <button
          onClick={handleBook}
          disabled={!slot || loading}
          className="btn-primary"
          style={{ padding: "12px 32px" }}
        >
          {loading ? "Booking…" : "Confirm Booking"}
        </button>
      </div>
    </div>
  );
}
