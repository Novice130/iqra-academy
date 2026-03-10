/**
 * Teacher Students Page — View and manage assigned students
 */

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { eq, and, sql, count, desc } from "drizzle-orm";
import { bookings, sessions, studentProfiles, progressRecords, lessonContent } from "@/db/schema";
import { format } from "date-fns";
import Link from "next/link";

export default async function TeacherStudentsPage() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });

  if (!session) return null;

  const user = session.user as { id: string };

  // 1. Fetch unique students taught by this teacher
  const studentsResult = await db
    .select({
      id: studentProfiles.id,
      name: studentProfiles.name,
      age: studentProfiles.age,
      track: studentProfiles.track,
      lastClass: sql<Date>`max(${sessions.scheduledStart})`,
    })
    .from(studentProfiles)
    .innerJoin(bookings, eq(bookings.studentProfileId, studentProfiles.id))
    .innerJoin(sessions, eq(bookings.sessionId, sessions.id))
    .where(eq(sessions.teacherId, user.id))
    .groupBy(studentProfiles.id);

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
            My Students
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            {studentsResult.length} active students
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {studentsResult.length > 0 ? (
          await Promise.all(studentsResult.map(async (student) => {
            // Fetch progress for this specific student
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
            const progress = Math.round((completed[0].count / totalInTrack) * 100);

            return (
              <div key={student.id} className="card">
                <div className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ background: "var(--accent)" }}>
                        {student.name.split(" ").map((n) => n[0]).join("")}
                      </div>
                      <div>
                        <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{student.name}</div>
                        <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                          Age {student.age} • {student.track.toLowerCase()}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                        Last Class: {student.lastClass ? format(student.lastClass, "MMM d") : "Never"}
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
            );
          }))
        ) : (
          <div className="card p-10 text-center">
            <p style={{ color: "var(--text-tertiary)" }}>You haven&apos;t been assigned any students yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
