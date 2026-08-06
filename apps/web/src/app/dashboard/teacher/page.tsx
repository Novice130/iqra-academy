/**
 * Teacher Dashboard — Home page for teachers
 * Shows today's schedule, student overview, and quick actions
 */

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db, withDb } from "@/lib/db";
import { eq, and, gte, lte, asc, desc, sql, count, isNull, or } from "drizzle-orm";
import { sessions, bookings, studentProfiles, users as usersTable } from "@/db/schema";
import { startOfDay, endOfDay, startOfWeek, endOfWeek, formatDistanceToNow } from "date-fns";
import Link from "next/link";
import StartInstantMeetingButton from "./StartInstantMeetingButton";
import CleanupInstantMeetingsButton from "./CleanupInstantMeetingsButton";
import SessionRowActions from "./SessionRowActions";
import TodaySchedule, { type ScheduleRow } from "./TodaySchedule";
import LocalTime from "@/components/LocalTime";
import CopyLinkButton from "@/components/CopyLinkButton";

export default async function TeacherDashboard() {
  return withDb(async () => {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });

  if (!session) return null;

  const user = session.user as unknown as { id: string; name?: string };
  const firstName = user.name?.split(" ")[0] || "Ustadh";

  // Role must come from our own users table. Better Auth's session user only
  // carries its built-in columns (no `additionalFields` configured), so
  // `session.user.role` is undefined — which silently hid the school-wide
  // active-classes panel from both admin accounts.
  const dbUser = await db.query.users.findFirst({
    where: eq(usersTable.id, user.id),
    columns: { role: true },
  });
  const isAdmin = ["ORG_ADMIN", "SUPER_ADMIN"].includes(dbUser?.role || "");

  // The server runs in UTC, so "today" here is a ±1 day window on purpose —
  // TodaySchedule narrows it to the viewer's own calendar day in the browser.
  const todayStart = startOfDay(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const todayEnd = endOfDay(new Date(Date.now() + 24 * 60 * 60 * 1000));
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

  // 4. Fetch School-wide Active Classes (for Admins)
  let activeClasses: any[] = [];
  if (isAdmin) {
    const rawSessions = await db.query.sessions.findMany({
      where: eq(sessions.status, "IN_PROGRESS"),
      with: {
        bookings: {
          with: { studentProfile: true },
        },
      },
      orderBy: [desc(sessions.actualStart)],
    });
    
    if (rawSessions.length > 0) {
      const teacherIds = [...new Set(rawSessions.map((s) => s.teacherId))];
      const teachers = await db.query.users.findMany({
        where: (u, { inArray }) => inArray(u.id, teacherIds),
        columns: { id: true, name: true }
      });
      
      activeClasses = rawSessions.map((s) => {
        const teacher = teachers.find(t => t.id === s.teacherId);
        return { ...s, teacher };
      });
    }
  }

  const scheduleRows: ScheduleRow[] = todaySessions.map((s) => ({
    id: s.id,
    scheduledStart: s.scheduledStart.toISOString(),
    status: s.status,
    title: s.title,
    track: s.track,
    studentNames:
      s.bookings.map((b) => b.studentProfile?.name).filter(Boolean).join(", ") || "No student",
  }));

  const upcomingCount = todaySessions.filter((s) => s.status === "SCHEDULED").length;

  return (
    <div className="p-6 lg:p-10 max-w-5xl">
      {/* Greeting */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Assalamu Alaikum, {firstName}
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
          You have {upcomingCount} classes coming up
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Next 48h" value={String(todaySessions.length)} sub="classes" />
        <StatCard label="This week" value={String(weekCountResult[0].count)} sub="sessions" />
        <StatCard label="Students" value={String(activeStudentsResult.length)} sub="active" />
        <StatCard label="Attendance" value="--" sub="coming soon" />
      </div>

      {/* Admin oversight — every class running anywhere in the school, with
          its join link. Full width and above the fold: an admin's own
          "today's schedule" is usually empty, so burying this in the right
          rail made live classes effectively invisible. */}
      {isAdmin && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold uppercase tracking-widest mb-4 flex items-center gap-2" style={{ color: "var(--text-tertiary)" }}>
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: activeClasses.length > 0 ? "#dc2626" : "var(--border)" }} />
            Live Classes — School-wide ({activeClasses.length})
          </h2>
          <div className="card">
            {activeClasses.length > 0 ? (
              activeClasses.map((s, i) => {
                const studentNames = s.bookings.map((b: any) => b.studentProfile?.name).filter(Boolean).join(", ") || "No student joined yet";
                return (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-4 flex-wrap p-4"
                    style={{ borderBottom: i < activeClasses.length - 1 ? "1px solid var(--border)" : undefined }}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                        {s.teacher?.name || "Unknown Teacher"} — {s.title || "Class"}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                        {studentNames}
                      </div>
                      <div className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
                        Started {s.actualStart ? formatDistanceToNow(s.actualStart) + " ago" : "recently"}
                        {s.actualStart ? <> · <LocalTime iso={s.actualStart.toISOString()} withZone /></> : null}
                        {s.videoRoomName ? ` · room ${s.videoRoomName}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Link
                        href={`/dashboard/session/${s.id}`}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                        style={{ background: "var(--accent)" }}
                      >
                        Join / Observe
                      </Link>
                      <CopyLinkButton path={`/dashboard/session/${s.id}`} />
                      <SessionRowActions sessionId={s.id} showEnd={true} />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-6 text-center">
                <p className="text-xs italic" style={{ color: "var(--text-tertiary)" }}>No classes in progress right now.</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-5 gap-6">
        {/* Today's schedule */}
        <div className="lg:col-span-3">
          <h2 className="text-sm font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>
            Today&apos;s Schedule
          </h2>
          <div className="card">
            <TodaySchedule rows={scheduleRows} />
          </div>
        </div>

        {/* Quick actions */}
        <div className="lg:col-span-2">
          <h2 className="text-sm font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>
            Quick Actions
          </h2>
          <div className="space-y-3">
            <StartInstantMeetingButton />
            <CleanupInstantMeetingsButton />
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
  });
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
