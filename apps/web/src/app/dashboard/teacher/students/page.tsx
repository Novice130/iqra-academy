/**
 * Teacher & Admin Students Page — View and manage assigned students
 */

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db, withDb } from "@/lib/db";
import { eq, and, sql, count, desc } from "drizzle-orm";
import { bookings, sessions, studentProfiles, progressRecords, lessonContent, users } from "@/db/schema";
import Link from "next/link";
import TeacherStudentsClient from "./TeacherStudentsClient";

function calculateAge(dob: string | Date | null | undefined): string | number {
  if (!dob) return "N/A";
  const birthDate = new Date(dob);
  if (isNaN(birthDate.getTime())) return "N/A";
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age >= 0 ? age : "N/A";
}

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

  // 2. Fetch total lesson counts per track
  const trackCounts = await db
    .select({ track: lessonContent.track, total: count() })
    .from(lessonContent)
    .groupBy(lessonContent.track);

  const totalLessonsMap = Object.fromEntries(
    trackCounts.map((tc) => [tc.track, tc.total])
  );

  const enrichedStudents = await Promise.all(
    studentsResult.map(async (student) => {
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
      const age = calculateAge(student.dateOfBirth);

      return {
        id: student.id,
        name: student.name,
        track: student.track,
        age,
        lastClass: student.lastClass ? new Date(student.lastClass).toISOString() : null,
        progress,
        currentLesson: latestNote ? latestNote.lesson.title : "Not started",
        teacherNotes: latestNote?.teacherNotes || null,
      };
    })
  );

  return (
    <div className="p-6 lg:p-10 max-w-6xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            {isAdmin ? "All Registered Students" : "My Students"}
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            {enrichedStudents.length} active students
          </p>
        </div>

        {/* Booking lives on one admin page, which takes the class time the
            old modal never sent (it always failed with a 400). */}
        {isAdmin && (
          <Link
            href="/admin/assign-student"
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition hover:opacity-90"
            style={{ background: "var(--accent)" }}
          >
            Book a class
          </Link>
        )}
      </div>

      <TeacherStudentsClient students={enrichedStudents} />
    </div>
  );
  });
}
