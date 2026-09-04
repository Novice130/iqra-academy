/**
 * @fileoverview Admin Panel Overview Page
 *
 * Server-side admin overview at /admin.
 * Displays live classes monitor, organization-wide metrics, and quick management tools.
 * Future scheduled rows are moved to /admin/scheduled-classes for clean information architecture.
 */

import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canAccessAdmin } from "@/lib/admin";
import { db, withDb } from "@/lib/db";
import { sessions, users, studentProfiles, invoices, sessionAttendance } from "@/db/schema";
import { sql, inArray, and, eq, isNull, gte, lte } from "drizzle-orm";
import { getRoomServiceClient } from "@/lib/livekit";
import ClassActionButton from "@/components/ClassActionButton";
import CopyLinkButton from "@/components/CopyLinkButton";
import SessionRowActions from "../dashboard/teacher/SessionRowActions";
import LocalTime from "@/components/LocalTime";
import { getAttendanceReport } from "@/lib/attendance";

interface LiveClassCardData {
  sessionId: string;
  roomName: string;
  title: string;
  track: string;
  teacherName: string;
  studentNames: string;
  numParticipants: number;
  actualStart: Date | null;
}

export default async function AdminPage() {
  return withDb(async () => {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session) {
      redirect("/login?redirect=/admin");
    }

    const dbUser = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: { id: true, role: true, orgId: true },
    });

    const role = dbUser?.role || "STUDENT";
    if (!canAccessAdmin(role) || !dbUser?.orgId) {
      redirect("/dashboard?error=unauthorized");
    }

    const isSuperAdmin = role === "SUPER_ADMIN";
    const orgId = dbUser.orgId;

    const [liveClasses, metrics] = await Promise.all([
      getVerifiedLiveClasses(orgId, isSuperAdmin),
      getOrgMetrics(orgId, isSuperAdmin),
    ]);

    return (
      <div className="space-y-8 animate-fadeIn">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[var(--border)]">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">🕌</span>
              <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                Admin Center
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                Live Overview
              </span>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Active classroom operations, school health metrics, and administration tools.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              href="/dashboard/teacher"
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition flex items-center gap-1.5"
            >
              <span>⚡</span> Instant Meeting
            </Link>
            <Link
              href="/admin/assign-student"
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border)] hover:bg-[var(--bg-secondary)] transition flex items-center gap-1.5"
            >
              <span>📋</span> Schedule with Teacher
            </Link>
            <Link
              href="/admin/users"
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-[var(--accent)] text-white shadow-sm hover:opacity-95 transition"
            >
              Manage Roles
            </Link>
            <Link
              href="/admin/invoices"
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border)] hover:bg-[var(--bg-secondary)] transition"
            >
              Manage Invoices
            </Link>
          </div>
        </div>

        {/* Overview Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          <MetricCard label="Active Students" value={String(metrics.students)} sub="enrolled" />
          <MetricCard label="Teachers" value={String(metrics.teachers)} sub="active faculty" />
          <MetricCard label="Today's Classes" value={String(metrics.todayClasses)} sub="scheduled" />
          <MetricCard label="Attendance Rate" value={metrics.attendanceRate} sub="last 30 days" />
          <MetricCard label="Open Invoices" value={String(metrics.openInvoices)} sub="pending payment" />
        </div>

        {/* Live Classes Monitor (Strictly active LiveKit rooms with verified teacher attendance) */}
        <section className="rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className={`w-2.5 h-2.5 rounded-full ${liveClasses.length > 0 ? "bg-red-500 animate-pulse" : "bg-zinc-400"}`} />
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                Live Classes Now ({liveClasses.length})
              </h2>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href="/admin/live-classes"
                className="text-xs font-semibold text-[var(--accent)] hover:underline"
              >
                Dedicated Live View →
              </Link>
              <Link
                href="/dashboard/attendance"
                className="text-xs font-semibold text-[var(--text-secondary)] hover:underline"
              >
                Attendance Log →
              </Link>
            </div>
          </div>

          <div className="p-6">
            {liveClasses.length === 0 ? (
              <div className="text-center py-10 space-y-4">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto text-xl font-bold">
                  ✓
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">No classes live right now</h3>
                  <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-sm mx-auto">
                    When a teacher starts a class and connects to the room, real-time telemetry and observer controls appear here automatically.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  <Link
                    href="/admin/scheduled-classes"
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border)] hover:bg-[var(--bg-elevated)] transition"
                  >
                    📅 View Scheduled Classes
                  </Link>
                  <Link
                    href="/admin/teacher-schedules"
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border)] hover:bg-[var(--bg-elevated)] transition"
                  >
                    📊 Open Teacher Spreadsheet
                  </Link>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {liveClasses.map((item) => (
                  <div
                    key={item.sessionId}
                    className="p-5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] flex flex-col justify-between space-y-4 shadow-xs"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-semibold text-sm text-[var(--text-primary)] truncate">
                          {item.title}
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
                          {item.track}
                        </span>
                      </div>

                      <div className="text-xs text-[var(--text-secondary)] mt-1.5">
                        <span className="font-medium text-[var(--text-primary)]">Teacher:</span> {item.teacherName}
                      </div>
                      <div className="text-xs text-[var(--text-secondary)] mt-1">
                        <span className="font-medium text-[var(--text-primary)]">Students:</span> {item.studentNames}
                      </div>

                      <div className="text-[11px] text-[var(--text-tertiary)] mt-2 flex items-center gap-2">
                        <span>
                          Started {item.actualStart ? <LocalTime iso={item.actualStart.toISOString()} mode="time" /> : "just now"}
                        </span>
                        <span>•</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                          {item.numParticipants} in room
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-[var(--border)] gap-2">
                      <ClassActionButton
                        session={{
                          id: item.sessionId,
                          status: "IN_PROGRESS",
                          actualStart: item.actualStart,
                          title: item.title,
                        }}
                        viewer={{ role: "ORG_ADMIN", isAdmin: true }}
                        variant="compact"
                      />
                      <div className="flex items-center gap-1.5">
                        <CopyLinkButton path={`/dashboard/session/${item.sessionId}`} />
                        <SessionRowActions sessionId={item.sessionId} showEnd={true} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Quick Management Section */}
        <section className="space-y-4">
          <h2 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
            <span>⚡</span> Quick Management Tools
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Link
              href="/admin/scheduled-classes"
              className="p-5 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] shadow-xs hover:border-emerald-500/40 transition block space-y-2"
            >
              <div className="text-2xl">📅</div>
              <div className="text-sm font-bold text-[var(--text-primary)]">Scheduled Classes Matrix</div>
              <p className="text-xs text-[var(--text-secondary)]">
                Inspect future classes, filter by date range, track, or teacher, and manage timetable bookings.
              </p>
            </Link>

            <Link
              href="/admin/teacher-schedules"
              className="p-5 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] shadow-xs hover:border-emerald-500/40 transition block space-y-2"
            >
              <div className="text-2xl">📊</div>
              <div className="text-sm font-bold text-[var(--text-primary)]">Teacher Schedules Spreadsheet</div>
              <p className="text-xs text-[var(--text-secondary)]">
                Dense weekly spreadsheet with availability shading, scheduled blocks, and time-off hatching.
              </p>
            </Link>

            <Link
              href="/admin/assign-student"
              className="p-5 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] shadow-xs hover:border-emerald-500/40 transition block space-y-2"
            >
              <div className="text-2xl">📋</div>
              <div className="text-sm font-bold text-[var(--text-primary)]">Assign Students</div>
              <p className="text-xs text-[var(--text-secondary)]">
                Pair students with certified teachers and allocate recurring learning slots.
              </p>
            </Link>

            <Link
              href="/admin/invoices"
              className="p-5 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] shadow-xs hover:border-emerald-500/40 transition block space-y-2"
            >
              <div className="text-2xl">💳</div>
              <div className="text-sm font-bold text-[var(--text-primary)]">Invoices & Billing</div>
              <p className="text-xs text-[var(--text-secondary)]">
                Issue manual invoices, record wire transfers, and track family subscription payments.
              </p>
            </Link>
          </div>
        </section>
      </div>
    );
  });
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] shadow-xs flex flex-col justify-between">
      <div className="text-2xl sm:text-3xl font-bold text-emerald-600 dark:text-emerald-400 tracking-tight">
        {value}
      </div>
      <div className="mt-2">
        <div className="text-xs font-semibold text-[var(--text-primary)]">{label}</div>
        <div className="text-[11px] text-[var(--text-tertiary)]">{sub}</div>
      </div>
    </div>
  );
}

/**
 * Fetches strictly verified live classes:
 * 1. Active LiveKit room with participants > 0
 * 2. Matches session in same organization
 * 3. Verified active teacher attendance in session
 */
async function getVerifiedLiveClasses(orgId: string, isSuperAdmin: boolean): Promise<LiveClassCardData[]> {
  try {
    const rooms = await getRoomServiceClient().listRooms().catch(() => []);
    if (!rooms || rooms.length === 0) return [];

    const activeRooms = rooms.filter((r) => r.numParticipants > 0);
    if (activeRooms.length === 0) return [];

    const sessionIds = activeRooms.map((r) => r.name.replace(/^qlms-/, ""));
    const whereClause = isSuperAdmin
      ? inArray(sessions.id, sessionIds)
      : and(inArray(sessions.id, sessionIds), eq(sessions.orgId, orgId));

    const matchedSessions = await db.query.sessions.findMany({
      where: whereClause,
      with: {
        teacher: { columns: { id: true, name: true, email: true } },
        bookings: {
          with: {
            studentProfile: { columns: { name: true } },
          },
        },
      },
    });

    if (matchedSessions.length === 0) return [];

    // Query active attendance for teachers in these sessions
    const activeAttendance = await db
      .select({ sessionId: sessionAttendance.sessionId, userId: sessionAttendance.userId })
      .from(sessionAttendance)
      .where(
        and(
          inArray(sessionAttendance.sessionId, matchedSessions.map((s) => s.id)),
          isNull(sessionAttendance.leftAt)
        )
      );

    const activeTeachersBySession = new Set(
      activeAttendance.map((a) => `${a.sessionId}:${a.userId}`)
    );

    const byId = new Map(matchedSessions.map((s) => [s.id, s]));
    const byVideoRoomName = new Map(
      matchedSessions.filter((s) => s.videoRoomName).map((s) => [s.videoRoomName!, s])
    );

    const verified: LiveClassCardData[] = [];

    for (const r of activeRooms) {
      const session = byId.get(r.name.replace(/^qlms-/, "")) || byVideoRoomName.get(r.name);
      if (!session) continue;

      // Ensure teacher is in attendance (or super-admin fallback)
      const hasTeacherPresent = isSuperAdmin || activeTeachersBySession.has(`${session.id}:${session.teacherId}`);
      if (!hasTeacherPresent) continue;

      const studentNames = session.bookings
        .map((b) => b.studentProfile?.name)
        .filter(Boolean)
        .join(", ") || "No students yet";

      verified.push({
        sessionId: session.id,
        roomName: r.name,
        title: session.title || "Quran Class",
        track: session.track || "QAIDAH",
        teacherName: session.teacher?.name || session.teacher?.email || "Teacher",
        studentNames,
        numParticipants: r.numParticipants,
        actualStart: session.actualStart ? new Date(session.actualStart) : null,
      });
    }

    return verified;
  } catch {
    return [];
  }
}

async function getOrgMetrics(orgId: string, isSuperAdmin: boolean) {
  try {
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
    const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

    const studentWhere = isSuperAdmin ? undefined : eq(studentProfiles.orgId, orgId);
    const teacherWhere = isSuperAdmin
      ? and(eq(users.role, "TEACHER"), isNull(users.deletedAt))
      : and(eq(users.orgId, orgId), eq(users.role, "TEACHER"), isNull(users.deletedAt));
    const todayClassWhere = isSuperAdmin
      ? and(gte(sessions.scheduledStart, todayStart), lte(sessions.scheduledStart, todayEnd))
      : and(eq(sessions.orgId, orgId), gte(sessions.scheduledStart, todayStart), lte(sessions.scheduledStart, todayEnd));
    const invoiceWhere = isSuperAdmin
      ? inArray(invoices.status, ["OPEN", "OVERDUE"])
      : and(eq(invoices.orgId, orgId), inArray(invoices.status, ["OPEN", "OVERDUE"]));

    const [studentsCount, teachersCount, todayCount, openInvoicesCount, attendanceReport] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(studentProfiles).where(studentWhere),
      db.select({ count: sql<number>`count(*)::int` }).from(users).where(teacherWhere),
      db.select({ count: sql<number>`count(*)::int` }).from(sessions).where(todayClassWhere),
      db.select({ count: sql<number>`count(*)::int` }).from(invoices).where(invoiceWhere),
      getAttendanceReport({
        orgId: isSuperAdmin ? "" : orgId,
        from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        to: new Date(),
      }).catch(() => []),
    ]);

    const expected = attendanceReport.reduce((sum, occ) => sum + occ.students.length, 0);
    const attended = attendanceReport.reduce(
      (sum, occ) => sum + occ.students.filter((s) => s.status !== "ABSENT").length,
      0
    );
    const attendanceRate = expected > 0 && attended > 0 ? `${Math.round((attended / expected) * 100)}%` : "--";

    return {
      students: studentsCount[0]?.count ?? 0,
      teachers: teachersCount[0]?.count ?? 0,
      todayClasses: todayCount[0]?.count ?? 0,
      openInvoices: openInvoicesCount[0]?.count ?? 0,
      attendanceRate,
    };
  } catch {
    return {
      students: 0,
      teachers: 0,
      todayClasses: 0,
      openInvoices: 0,
      attendanceRate: "--",
    };
  }
}
