/**
 * Teacher Dashboard — Home page for teachers
 * Shows today's schedule, student overview, and quick actions
 */

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import Link from "next/link";

const TODAY_SESSIONS = [
  { time: "9:00 AM", student: "Ahmad K.", subject: "Qaidah — Lesson 12", status: "completed" },
  { time: "10:00 AM", student: "Fatima R.", subject: "Tajweed — Noon Sakinah", status: "completed" },
  { time: "2:00 PM", student: "Zayd M.", subject: "Hifz — Surah Yaseen", status: "upcoming" },
  { time: "4:00 PM", student: "Aisha S.", subject: "Qaidah — Lesson 8", status: "upcoming" },
  { time: "5:00 PM", student: "Yusuf S.", subject: "Quran Reading — Al-Baqarah", status: "upcoming" },
];

const MY_STUDENTS = [
  { name: "Ahmad K.", track: "Qaidah", progress: 42, sessions: 12 },
  { name: "Fatima R.", track: "Tajweed", progress: 78, sessions: 28 },
  { name: "Zayd M.", track: "Hifz", progress: 15, sessions: 8 },
  { name: "Aisha S.", track: "Qaidah", progress: 28, sessions: 8 },
  { name: "Yusuf S.", track: "Quran Reading", progress: 32, sessions: 14 },
];

export default async function TeacherDashboard() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  const user = session?.user as { name?: string } | undefined;
  const firstName = user?.name?.split(" ")[0] || "Ustadh";

  return (
    <div className="p-6 lg:p-10 max-w-5xl">
      {/* Greeting */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Assalamu Alaikum, {firstName}
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
          You have {TODAY_SESSIONS.filter((s) => s.status === "upcoming").length} classes remaining today
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Today" value="5" sub="classes" />
        <StatCard label="This week" value="18" sub="sessions" />
        <StatCard label="Students" value={String(MY_STUDENTS.length)} sub="active" />
        <StatCard label="Attendance" value="96%" sub="this month" />
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* Today's schedule */}
        <div className="lg:col-span-3">
          <h2 className="text-sm font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>
            Today&apos;s Schedule
          </h2>
          <div className="card">
            {TODAY_SESSIONS.map((s, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-4"
                style={{ borderBottom: i < TODAY_SESSIONS.length - 1 ? "1px solid var(--border)" : undefined }}
              >
                <div className="flex items-center gap-4">
                  <div className="text-xs font-mono font-bold w-16" style={{ color: "var(--text-tertiary)" }}>
                    {s.time}
                  </div>
                  <div>
                    <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{s.student}</div>
                    <div className="text-xs" style={{ color: "var(--text-secondary)" }}>{s.subject}</div>
                  </div>
                </div>
                {s.status === "upcoming" ? (
                  <Link
                    href={`/dashboard/session/${i}`}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                    style={{ background: "var(--accent)" }}
                  >
                    Start Class
                  </Link>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase" style={{ background: "#dcfce7", color: "#166534" }}>
                    Done
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Quick actions */}
        <div className="lg:col-span-2">
          <h2 className="text-sm font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>
            Quick Actions
          </h2>
          <div className="space-y-3">
            <Link href="/dashboard/teacher/students" className="card p-4 block">
              <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>👨‍🎓 My Students</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>View progress & add feedback</div>
            </Link>
            <Link href="/dashboard/teacher/availability" className="card p-4 block">
              <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>📅 Availability</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>Set your weekly schedule</div>
            </Link>
            <Link href="/dashboard/chat" className="card p-4 block">
              <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>💬 Messages</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>Chat with parents</div>
            </Link>
            <Link href="/dashboard/schedule" className="card p-4 block">
              <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>📊 Full Schedule</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>Weekly calendar view</div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium mb-2" style={{ color: "var(--text-tertiary)" }}>{label}</div>
      <div className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>{value}</div>
      <div className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{sub}</div>
    </div>
  );
}
