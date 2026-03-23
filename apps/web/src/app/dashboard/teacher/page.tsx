/**
 * Teacher Dashboard — Home page for teachers
 * Shows today's schedule, student overview, and quick actions
 */

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { eq, and, gte, lte, asc, desc, sql, count, isNull, or } from "drizzle-orm";
import { sessions, bookings, studentProfiles, users as usersTable } from "@/db/schema";
import { startOfDay, endOfDay, startOfWeek, endOfWeek, format } from "date-fns";
import Link from "next/link";

export default async function TeacherDashboard() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });

  if (!session) return null;

  const user = session.user as { id: string; name?: string; role: string };
  const firstName = user.name?.split(" ")[0] || "Ustadh";

  const todayStart = startOfDay(new Date());
  const todayEnd = endOfDay(new Date());
  const weekStart = startOfWeek(new Date());
  const weekEnd = endOfWeek(new Date());

  // 1. Fetch Today's Sessions
  const todaySessions = await db.query.sessions.findMany({
    where: and(
      eq(sessions.teacherId, user.id),
      gte(sessions.scheduledStart, todayStart),
      lte(sessions.scheduledStart, todayEnd)
    ),
    with: {
      bookings: {
        with: {
          studentProfile: true,
        },
      },
    },
    orderBy: [asc(sessions.scheduledStart)],
  });

  // 2. Fetch Weekly Stats
  const weekCountResult = await db
    .select({ count: count() })
    .from(sessions)
    .where(
      and(
        eq(sessions.teacherId, user.id),
        gte(sessions.scheduledStart, weekStart),
        lte(sessions.scheduledStart, weekEnd)
      )
    );

  // 3. Fetch Active Students (Unique students taught by this teacher)
  const activeStudentsResult = await db
    .select({ studentId: bookings.studentProfileId })
    .from(bookings)
    .innerJoin(sessions, eq(bookings.sessionId, sessions.id))
    .where(eq(sessions.teacherId, user.id))
    .groupBy(bookings.studentProfileId);

  return (
    <div className="p-6 lg:p-10 max-w-5xl">
      {/* Greeting */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Assalamu Alaikum, {firstName}
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
          You have {todaySessions.filter((s) => s.status === "SCHEDULED").length} classes remaining today
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Today" value={String(todaySessions.length)} sub="classes" />
        <StatCard label="This week" value={String(weekCountResult[0].count)} sub="sessions" />
        <StatCard label="Students" value={String(activeStudentsResult.length)} sub="active" />
        <StatCard label="Attendance" value="--" sub="coming soon" />
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* Today's schedule */}
        <div className="lg:col-span-3">
          <h2 className="text-sm font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>
            Today&apos;s Schedule
          </h2>
          <div className="card">
            {todaySessions.length > 0 ? (
              todaySessions.map((s, i) => {
                const studentNames = s.bookings.map(b => b.studentProfile.name).join(", ") || "No student";
                const isUpcoming = s.status === "SCHEDULED";
                return (
                  <div
                    key={s.id}
                    className="flex items-center justify-between p-4"
                    style={{ borderBottom: i < todaySessions.length - 1 ? "1px solid var(--border)" : undefined }}
                  >
                    <div className="flex items-center gap-4">
                      <div className="text-xs font-mono font-bold w-16" style={{ color: "var(--text-tertiary)" }}>
                        {format(s.scheduledStart, "h:mm a")}
                      </div>
                      <div>
                        <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{studentNames}</div>
                        <div className="text-xs" style={{ color: "var(--text-secondary)" }}>{s.track} — {s.title}</div>
                      </div>
                    </div>
                    {isUpcoming ? (
                      <Link
                        href={`/dashboard/session/${s.id}`}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                        style={{ background: "var(--accent)" }}
                      >
                        Start Class
                      </Link>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase" style={{ background: "#dcfce7", color: "#166534" }}>
                        {s.status.toLowerCase()}
                      </span>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="p-10 text-center">
                <p className="text-sm italic" style={{ color: "var(--text-tertiary)" }}>No classes scheduled for today.</p>
              </div>
            )}
          </div>
        </div>

        {/* Quick actions */}
        <div className="lg:col-span-2">
          <h2 className="text-sm font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>
            Quick Actions
          </h2>
          <div className="space-y-3">
            <Link href="/dashboard/teacher/students" className="card p-4 block hover:opacity-80 transition-opacity">
              <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>👨‍🎓 My Students</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>View progress & add feedback</div>
            </Link>
            <Link href="/dashboard/teacher/availability" className="card p-4 block hover:opacity-80 transition-opacity">
              <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>📅 Availability</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>Set your weekly schedule</div>
            </Link>
            <Link href="/dashboard/chat" className="card p-4 block hover:opacity-80 transition-opacity">
              <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>💬 Messages</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>Chat with parents</div>
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
