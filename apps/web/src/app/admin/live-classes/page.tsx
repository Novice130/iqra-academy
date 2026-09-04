/**
 * @fileoverview Dedicated Admin Live Classes Monitor Page
 *
 * Route: /admin/live-classes
 * Displays all active LiveKit classroom rooms with live participant counts and observer tools.
 */

import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canAccessAdmin } from "@/lib/admin";
import { db, withDb } from "@/lib/db";
import { sessions, users, sessionAttendance } from "@/db/schema";
import { inArray, and, eq, isNull } from "drizzle-orm";
import { getRoomServiceClient } from "@/lib/livekit";
import ClassActionButton from "@/components/ClassActionButton";
import CopyLinkButton from "@/components/CopyLinkButton";
import SessionRowActions from "../../dashboard/teacher/SessionRowActions";
import LocalTime from "@/components/LocalTime";

interface LiveClassDetail {
  sessionId: string;
  roomName: string;
  title: string;
  track: string;
  teacherName: string;
  teacherEmail: string;
  studentNames: string;
  numParticipants: number;
  actualStart: Date | null;
}

export default async function AdminLiveClassesPage() {
  return withDb(async () => {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session) redirect("/login?redirect=/admin/live-classes");

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

    const liveClasses = await getDetailedLiveClasses(orgId, isSuperAdmin);

    return (
      <div className="space-y-6 animate-fadeIn">
        {/* Header with Breadcrumbs */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[var(--border)]">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-secondary)] mb-1">
              <Link href="/admin" className="hover:text-[var(--accent)] transition">
                Admin
              </Link>
              <span>/</span>
              <span>Live Classes</span>
            </div>
            <div className="flex items-center gap-2.5">
              <span className={`w-3 h-3 rounded-full ${liveClasses.length > 0 ? "bg-red-500 animate-pulse" : "bg-zinc-400"}`} />
              <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                Live Classroom Monitor ({liveClasses.length})
              </h1>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Real-time telemetry and supervision for in-progress classes across the school.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/admin/scheduled-classes"
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border)] hover:bg-[var(--bg-secondary)] transition"
            >
              📅 Scheduled Classes
            </Link>
            <Link
              href="/admin"
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border)] hover:bg-[var(--bg-secondary)] transition"
            >
              ← Back to Overview
            </Link>
          </div>
        </div>

        {/* Live Classes Grid */}
        {liveClasses.length === 0 ? (
          <div className="p-12 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 flex items-center justify-center mx-auto text-xl">
              📹
            </div>
            <div>
              <h3 className="text-base font-semibold text-[var(--text-primary)]">No Active Classes Right Now</h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-md mx-auto">
                There are no classes currently running with participants connected. When a teacher joins an occurrence, telemetry will appear here in real time.
              </p>
            </div>
            <div className="pt-2 flex items-center justify-center gap-3">
              <Link
                href="/admin/scheduled-classes"
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--accent)] text-white shadow-xs hover:opacity-95 transition"
              >
                Inspect Scheduled Classes
              </Link>
              <Link
                href="/admin/teacher-schedules"
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border)] hover:bg-[var(--bg-elevated)] transition"
              >
                Teacher Schedules
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {liveClasses.map((item) => (
              <div
                key={item.sessionId}
                className="p-6 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)] flex flex-col justify-between space-y-5 shadow-xs"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-base text-[var(--text-primary)] leading-snug">
                        {item.title}
                      </h3>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                        Room: <code className="text-[11px] font-mono">{item.roomName}</code>
                      </p>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
                      {item.track}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-[var(--bg-secondary)] space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">Teacher:</span>
                      <span className="font-semibold text-[var(--text-primary)]">{item.teacherName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">Students:</span>
                      <span className="font-semibold text-[var(--text-primary)] truncate max-w-[180px] text-right">
                        {item.studentNames}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">Started:</span>
                      <span className="font-medium text-[var(--text-primary)]">
                        {item.actualStart ? <LocalTime iso={item.actualStart.toISOString()} mode="time" /> : "Recently"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                      {item.numParticipants} participants connected
                    </span>
                    <span className="text-[11px] text-[var(--text-tertiary)]">
                      Telemetery: Active
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-[var(--border)] gap-2">
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
    );
  });
}

async function getDetailedLiveClasses(orgId: string, isSuperAdmin: boolean): Promise<LiveClassDetail[]> {
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

    const details: LiveClassDetail[] = [];

    for (const r of activeRooms) {
      const session = byId.get(r.name.replace(/^qlms-/, "")) || byVideoRoomName.get(r.name);
      if (!session) continue;

      const hasTeacherPresent = isSuperAdmin || activeTeachersBySession.has(`${session.id}:${session.teacherId}`);
      if (!hasTeacherPresent) continue;

      const studentNames = session.bookings
        .map((b) => b.studentProfile?.name)
        .filter(Boolean)
        .join(", ") || "No students yet";

      details.push({
        sessionId: session.id,
        roomName: r.name,
        title: session.title || "Quran Class",
        track: session.track || "QAIDAH",
        teacherName: session.teacher?.name || session.teacher?.email || "Teacher",
        teacherEmail: session.teacher?.email || "",
        studentNames,
        numParticipants: r.numParticipants,
        actualStart: session.actualStart ? new Date(session.actualStart) : null,
      });
    }

    return details;
  } catch {
    return [];
  }
}
