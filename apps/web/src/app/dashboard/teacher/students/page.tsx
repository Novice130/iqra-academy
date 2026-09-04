/**
 * Teacher & Admin Students Page — View and manage assigned students
 */

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db, withDb } from "@/lib/db";
import { eq, and, sql, count, desc, inArray, isNull } from "drizzle-orm";
import { bookings, sessions, studentProfiles, progressRecords, lessonContent, users } from "@/db/schema";
import { format } from "date-fns";
import Link from "next/link";
import AssignStudentModal from "./AssignStudentModal";
import CallStudentButton from "./CallStudentButton";

export default async function TeacherStudentsPage() {
  return withDb(async () => {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });

  if (!session) return null;

  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { id: true, role: true, orgId: true },
  });

  const role = dbUser?.role || "STUDENT";
  const orgId = dbUser?.orgId || "";
  const isSuperAdmin = role === "SUPER_ADMIN";
  const isAdmin = ["ORG_ADMIN", "SUPER_ADMIN"].includes(role);

  // 1. Fetch Students
  let studentsResult: any[] = [];
  if (isAdmin) {
    // Admin sees ALL student profiles in org
    const adminConditions = [];
    if (!isSuperAdmin) {
      adminConditions.push(eq(studentProfiles.orgId, orgId));
    }

    studentsResult = await db
      .select({
        id: studentProfiles.id,
        name: studentProfiles.name,
        dateOfBirth: studentProfiles.dateOfBirth,
        track: studentProfiles.track,
        lastClass: sql<Date>`max(${sessions.scheduledStart})`,
      })
      .from(studentProfiles)
      .leftJoin(bookings, eq(bookings.studentProfileId, studentProfiles.id))
      .leftJoin(sessions, eq(bookings.sessionId, sessions.id))
      .where(adminConditions.length > 0 ? and(...adminConditions) : undefined)
      .groupBy(studentProfiles.id);
  } else {
    // Teacher sees students assigned to them in org
    studentsResult = await db
      .select({
        id: studentProfiles.id,
        name: studentProfiles.name,
        dateOfBirth: studentProfiles.dateOfBirth,
        track: studentProfiles.track,
        lastClass: sql<Date>`max(${sessions.scheduledStart})`,
      })
      .from(studentProfiles)
      .innerJoin(bookings, eq(bookings.studentProfileId, studentProfiles.id))
      .innerJoin(sessions, eq(bookings.sessionId, sessions.id))
      .where(
        and(
          eq(sessions.teacherId, dbUser?.id || session.user.id),
          eq(studentProfiles.orgId, orgId)
        )
      )
      .groupBy(studentProfiles.id);
  }

  // Fetch all teachers and all students for the admin modal
  const allStudentProfiles = isAdmin
    ? await db.query.studentProfiles.findMany({
        where: isSuperAdmin ? undefined : eq(studentProfiles.orgId, orgId),
        columns: { id: true, name: true, track: true },
      })
    : [];

  const allTeachers = isAdmin
    ? await db.query.users.findMany({
        where: isSuperAdmin
          ? and(inArray(users.role, ["TEACHER", "ORG_ADMIN", "SUPER_ADMIN"]), isNull(users.deletedAt))
          : and(
              inArray(users.role, ["TEACHER", "ORG_ADMIN", "SUPER_ADMIN"]),
              eq(users.orgId, orgId),
              isNull(users.deletedAt)
            ),
        columns: { id: true, name: true, email: true },
      })
    : [];

  // 2. Fetch total lesson counts per track
  const trackCounts = await db
    .select({ track: lessonContent.track, total: count() })
    .from(lessonContent)
    .groupBy(lessonContent.track);

  const totalLessonsMap = Object.fromEntries(
    trackCounts.map((tc) => [tc.track, tc.total])
  );

  return (
    <div className="p-6 lg:p-10 max-w-5xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            {isAdmin ? "All Registered Students" : "My Students"}
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            {studentsResult.length} active students
          </p>
        </div>

        {isAdmin && (
          <AssignStudentModal
            students={allStudentProfiles}
            teachers={allTeachers}
          />
        )}
      </div>

      <div className="space-y-4">
        {studentsResult.length > 0 ? (
          await Promise.all(studentsResult.map(async (student) => {
            const completed = await db
              .select({ count: count() })
              .from(progressRecords)
              .where(and(eq(progressRecords.studentProfileId, student.id), eq(progressRecords.isCompleted, true)));

            const latestNote = await db.query.progressRecords.findFirst({
              where: eq(progressRecords.studentProfileId, student.id),
              orderBy: [desc(progressRecords.completedAt)],
              with: { lesson: true }
            });

            const totalInTrack = totalLessonsMap[student.track] || 1;
            const progress = Math.min(100, Math.round(((completed[0]?.count || 0) / totalInTrack) * 100));
            const age = student.dateOfBirth
              ? new Date().getFullYear() - new Date(student.dateOfBirth).getFullYear()
              : "N/A";

            return (
              <div key={student.id} className="card">
                <div className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ background: "var(--accent)" }}>
                        {student.name.split(" ").map((n: string) => n[0]).join("")}
                      </div>
                      <div>
                        <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{student.name}</div>
                        <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                          Age {age} • {student.track.toLowerCase()}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                        Last Class: {student.lastClass ? format(new Date(student.lastClass), "MMM d") : "Never"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                      {latestNote ? latestNote.lesson.title : "Not started"}
                    </span>
                    <span className="text-sm font-bold" style={{ color: "var(--accent)" }}>{progress}%</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden mb-3" style={{ background: "var(--bg-secondary)" }}>
                    <div className="h-full rounded-full" style={{ width: `${progress}%`, background: "var(--accent)" }} />
                  </div>

                  <div className="flex items-center justify-between">
                    <p className="text-xs italic" style={{ color: "var(--text-tertiary)" }}>
                      {latestNote?.teacherNotes ? `📝 ${latestNote.teacherNotes}` : "No feedback yet."}
                    </p>
                    <div className="flex items-center gap-2">
                      <CallStudentButton studentProfileId={student.id} studentName={student.name} />
                      <Link
                        href={`/dashboard/teacher/students/${student.id}`}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors hover:bg-opacity-10 hover:bg-accent"
                        style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
                      >
                        View Details
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            );
          }))
        ) : (
          <div className="card p-10 text-center">
            <p style={{ color: "var(--text-tertiary)" }}>No students found.</p>
          </div>
        )}
      </div>
    </div>
  );
  });
}
