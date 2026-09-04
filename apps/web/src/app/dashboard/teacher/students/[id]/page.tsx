/**
 * Teacher & Admin Student Detail Workspace — View comprehensive student history & progress records
 */

import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { eq, and, desc, count } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, withDb } from "@/lib/db";
import {
  studentProfiles,
  users,
  progressRecords,
  bookings,
  sessions,
  lessonContent,
} from "@/db/schema";
import CallStudentButton from "../CallStudentButton";

interface PageProps {
  params: Promise<{ id: string }>;
}

const TRACK_TITLES: Record<string, string> = {
  QAIDAH: "Noorani Qaida (Beginner)",
  QURAN_READING: "Quran Reading with Tajweed",
  HIFZ: "Quran Memorization (Hifz)",
};

export default async function StudentDetailPage({ params }: PageProps) {
  const { id } = await params;

  return withDb(async () => {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });

    if (!session) {
      redirect("/login");
    }

    const caller = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: { id: true, role: true, orgId: true },
    });

    const isStaff = ["TEACHER", "ORG_ADMIN", "SUPER_ADMIN"].includes(caller?.role || "");
    if (!isStaff) {
      redirect("/dashboard");
    }

    const callerOrgId = caller?.orgId || "";
    const isSuperAdmin = caller?.role === "SUPER_ADMIN";

    // 1. Fetch student profile and associated parent user
    const student = await db.query.studentProfiles.findFirst({
      where: eq(studentProfiles.id, id),
      with: {
        user: {
          columns: { id: true, name: true, email: true, phone: true, timezone: true },
        },
      },
    });

    if (!student) {
      notFound();
    }

    if (!isSuperAdmin && student.orgId !== callerOrgId) {
      notFound();
    }

    // 2. Fetch progress records with lessons
    const records = await db.query.progressRecords.findMany({
      where: eq(progressRecords.studentProfileId, id),
      with: {
        lesson: true,
      },
      orderBy: [desc(progressRecords.createdAt)],
      limit: 30,
    });

    // 3. Fetch past and upcoming session bookings
    const studentBookings = await db.query.bookings.findMany({
      where: eq(bookings.studentProfileId, id),
      with: {
        session: {
          with: {
            teacher: {
              columns: { id: true, name: true, email: true },
            },
          },
        },
      },
      orderBy: [desc(bookings.createdAt)],
      limit: 15,
    });

    // 4. Calculate progress percentage
    const completedCount = await db
      .select({ count: count() })
      .from(progressRecords)
      .where(and(eq(progressRecords.studentProfileId, id), eq(progressRecords.isCompleted, true)));

    const totalTrackLessons = await db
      .select({ count: count() })
      .from(lessonContent)
      .where(eq(lessonContent.track, student.track));

    const totalLessons = totalTrackLessons[0]?.count || 1;
    const completed = completedCount[0]?.count || 0;
    const progressPercent = Math.min(100, Math.round((completed / totalLessons) * 100));

    const age = student.dateOfBirth
      ? new Date().getFullYear() - new Date(student.dateOfBirth).getFullYear()
      : null;

    return (
      <div className="p-6 lg:p-10 max-w-5xl">
        {/* Navigation Breadcrumb */}
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/dashboard/teacher/students"
            className="inline-flex items-center gap-2 text-xs font-semibold px-3.5 py-2 rounded-xl transition hover:opacity-80"
            style={{
              background: "var(--bg-secondary)",
              color: "var(--text-secondary)",
              border: "1px solid var(--border)",
            }}
          >
            ← Back to Students
          </Link>

          <CallStudentButton studentProfileId={student.id} studentName={student.name} />
        </div>

        {/* Student Header Card */}
        <div className="card p-6 mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold text-white shadow-md shrink-0"
                style={{ background: "var(--accent)" }}
              >
                {student.name[0]?.toUpperCase() || "S"}
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
                  {student.name}
                </h1>
                <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                  {TRACK_TITLES[student.track] || student.track}
                  {age ? ` · ${age} years old` : ""}
                </p>
              </div>
            </div>

            <div className="sm:text-right">
              <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                Curriculum Progress
              </div>
              <div className="text-2xl font-bold mt-0.5" style={{ color: "var(--accent)" }}>
                {progressPercent}%
              </div>
              <div className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                {completed} of {totalLessons} lessons completed
              </div>
            </div>
          </div>

          <div className="mt-6 pt-5 grid sm:grid-cols-3 gap-4 text-xs" style={{ borderTop: "1px solid var(--border)" }}>
            <div>
              <span className="font-semibold block" style={{ color: "var(--text-tertiary)" }}>Parent / Guardian</span>
              <span className="font-medium text-sm mt-0.5 block" style={{ color: "var(--text-primary)" }}>
                {student.user.name || "N/A"}
              </span>
            </div>
            <div>
              <span className="font-semibold block" style={{ color: "var(--text-tertiary)" }}>Contact Email</span>
              <span className="font-medium mt-0.5 block" style={{ color: "var(--text-primary)" }}>
                {student.user.email}
              </span>
            </div>
            <div>
              <span className="font-semibold block" style={{ color: "var(--text-tertiary)" }}>Timezone / Phone</span>
              <span className="font-medium mt-0.5 block" style={{ color: "var(--text-primary)" }}>
                {student.user.timezone || "UTC"} {student.user.phone ? `· ${student.user.phone}` : ""}
              </span>
            </div>
          </div>

          {student.notes && (
            <div className="mt-4 p-3.5 rounded-xl text-xs" style={{ background: "var(--bg-secondary)", color: "var(--text-primary)" }}>
              <strong>Parent Notes:</strong> {student.notes}
            </div>
          )}
        </div>

        {/* Two-Column Section: Progress Logs & Class History */}
        <div className="grid md:grid-cols-2 gap-8">
          {/* Progress Records */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
                Lesson Progress & Feedback
              </h2>
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {records.length} records
              </span>
            </div>

            {records.length > 0 ? (
              <div className="space-y-3">
                {records.map((record) => (
                  <div key={record.id} className="card p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="font-semibold text-xs" style={{ color: "var(--text-primary)" }}>
                        {record.lesson?.title || "Class Practice"}
                      </div>
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-md"
                        style={{
                          background: record.isCompleted ? "rgba(16,185,129,0.12)" : "rgba(245,158,11,0.12)",
                          color: record.isCompleted ? "#059669" : "#d97706",
                        }}
                      >
                        {record.isCompleted ? "✓ Completed" : "In Progress"}
                      </span>
                    </div>

                    {record.teacherNotes && (
                      <p className="text-xs italic mb-2 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                        📝 &ldquo;{record.teacherNotes}&rdquo;
                      </p>
                    )}

                    <div className="flex items-center justify-between text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                      <span>
                        {record.score !== null && record.score !== undefined ? `Score: ${record.score}%` : "No score recorded"}
                      </span>
                      <span>
                        {format(new Date(record.createdAt), "MMM d, yyyy · h:mm a")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="card p-8 text-center text-xs" style={{ color: "var(--text-tertiary)" }}>
                No progress records yet. Tutors record notes during and after live classes.
              </div>
            )}
          </div>

          {/* Session History */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
                Class Schedule & Attendance
              </h2>
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {studentBookings.length} sessions
              </span>
            </div>

            {studentBookings.length > 0 ? (
              <div className="space-y-3">
                {studentBookings.map((b) => {
                  const s = b.session;
                  if (!s) return null;
                  const isPast = new Date(s.scheduledEnd) < new Date();

                  return (
                    <div key={b.id} className="card p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                            {format(new Date(s.scheduledStart), "EEEE, MMM d, yyyy")}
                          </div>
                          <div className="text-[11px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                            {format(new Date(s.scheduledStart), "h:mm a")} – {format(new Date(s.scheduledEnd), "h:mm a")}
                            {s.teacher ? ` · Teacher: ${s.teacher.name}` : ""}
                          </div>
                        </div>

                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase"
                          style={{
                            background: s.status === "COMPLETED" ? "#dcfce7" : isPast ? "#fee2e2" : "#e0e7ff",
                            color: s.status === "COMPLETED" ? "#166534" : isPast ? "#991b1b" : "#3730a3",
                          }}
                        >
                          {s.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="card p-8 text-center text-xs" style={{ color: "var(--text-tertiary)" }}>
                No scheduled sessions found for this student.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  });
}
