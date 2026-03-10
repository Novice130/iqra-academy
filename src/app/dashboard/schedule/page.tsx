"use client";

/**
 * Schedule Page — Weekly calendar view of upcoming classes
 */

import { useState } from "react";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 12 }, (_, i) => i + 8); // 8 AM to 7 PM

// Demo data — will be replaced with API data
const DEMO_SESSIONS = [
  { id: 1, day: 1, hour: 16, student: "Aisha", subject: "Qaidah — Lesson 8", teacher: "Ustadh Ali", duration: 30 },
  { id: 2, day: 3, hour: 10, student: "Yusuf", subject: "Quran Reading — Al-Baqarah", teacher: "Ustadh Ali", duration: 30 },
  { id: 3, day: 5, hour: 14, student: "Aisha", subject: "Qaidah — Lesson 9", teacher: "Ustadh Ali", duration: 30 },
  { id: 4, day: 6, hour: 11, student: "Yusuf", subject: "Tajweed Practice", teacher: "Ustadh Ali", duration: 30 },
];

const STUDENT_COLORS: Record<string, string> = {
  Aisha: "#5C7C6F",
  Yusuf: "#C9A962",
};

export default function SchedulePage() {
  const [weekOffset, setWeekOffset] = useState(0);

  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay() + weekOffset * 7);

  const weekDates = DAYS.map((_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return d;
  });

  const isToday = (date: Date) =>
    date.toDateString() === today.toDateString();

  return (
    <div className="p-6 lg:p-10 max-w-6xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            Schedule
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Your weekly class calendar
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekOffset((w) => w - 1)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
          >
            ← Prev
          </button>
          <button
            onClick={() => setWeekOffset(0)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            style={{ background: weekOffset === 0 ? "var(--accent)" : "var(--bg-elevated)", color: weekOffset === 0 ? "#fff" : "var(--text-secondary)", border: "1px solid var(--border)" }}
          >
            Today
          </button>
          <button
            onClick={() => setWeekOffset((w) => w + 1)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
          >
            Next →
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-6">
        {Object.entries(STUDENT_COLORS).map(([name, color]) => (
          <div key={name} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ background: color }} />
            <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{name}</span>
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="card overflow-hidden">
        {/* Header row */}
        <div className="grid grid-cols-8" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="p-3" style={{ borderRight: "1px solid var(--border)" }} />
          {weekDates.map((date, i) => (
            <div
              key={i}
              className="p-3 text-center"
              style={{
                borderRight: i < 6 ? "1px solid var(--border)" : undefined,
                background: isToday(date) ? "var(--accent)" : undefined,
                color: isToday(date) ? "#fff" : "var(--text-primary)",
              }}
            >
              <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ opacity: isToday(date) ? 1 : 0.5 }}>
                {DAYS[i]}
              </div>
              <div className="text-lg font-bold mt-0.5">{date.getDate()}</div>
            </div>
          ))}
        </div>

        {/* Time slots */}
        {HOURS.map((hour) => (
          <div key={hour} className="grid grid-cols-8" style={{ borderBottom: "1px solid var(--border)", minHeight: 56 }}>
            <div className="p-2 text-xs font-medium text-right pr-3 pt-3" style={{ color: "var(--text-tertiary)", borderRight: "1px solid var(--border)" }}>
              {hour > 12 ? `${hour - 12} PM` : hour === 12 ? "12 PM" : `${hour} AM`}
            </div>
            {DAYS.map((_, dayIndex) => {
              const session = DEMO_SESSIONS.find((s) => s.day === dayIndex && s.hour === hour);
              return (
                <div
                  key={dayIndex}
                  className="p-1 relative"
                  style={{ borderRight: dayIndex < 6 ? "1px solid var(--border)" : undefined }}
                >
                  {session && (
                    <div
                      className="absolute inset-1 rounded-lg p-2 text-white text-xs cursor-pointer transition-transform hover:scale-[1.02]"
                      style={{ background: STUDENT_COLORS[session.student] || "var(--accent)" }}
                    >
                      <div className="font-semibold truncate">{session.student}</div>
                      <div className="truncate opacity-80" style={{ fontSize: 10 }}>{session.subject}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
