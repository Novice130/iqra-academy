/**
 * @fileoverview Scheduled Classes Management Page
 *
 * Route: /admin/scheduled-classes
 * Server component that fetches organization scheduled classes and active teachers,
 * then renders the interactive ScheduledClassesTable.
 */

import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canAccessAdmin } from "@/lib/admin";
import { db, withDb } from "@/lib/db";
import { sessions, users } from "@/db/schema";
import { asc, and, eq, isNull, inArray, gte } from "drizzle-orm";
import ScheduledClassesTable, {
  type ScheduledClassRow,
  type TeacherFilterOption,
} from "./ScheduledClassesTable";

export default async function AdminScheduledClassesPage() {
  return withDb(async () => {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session) redirect("/login?redirect=/admin/scheduled-classes");

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

    // Fetch teachers in this organization
    const teacherRows = await db.query.users.findMany({
      where: isSuperAdmin
        ? and(inArray(users.role, ["TEACHER", "ORG_ADMIN", "SUPER_ADMIN"]), isNull(users.deletedAt))
        : and(
            inArray(users.role, ["TEACHER", "ORG_ADMIN", "SUPER_ADMIN"]),
            eq(users.orgId, orgId),
            isNull(users.deletedAt)
          ),
      columns: { id: true, name: true, email: true },
      orderBy: [asc(users.name)],
    });

    const teacherOptions: TeacherFilterOption[] = teacherRows.map((t) => ({
      id: t.id,
      name: t.name || t.email || "Teacher",
    }));

    // Fetch scheduled classes starting from yesterday onwards
    const sinceYesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sessionWhere = isSuperAdmin
      ? and(gte(sessions.scheduledStart, sinceYesterday), isNull(sessions.mergedIntoId))
      : and(
          eq(sessions.orgId, orgId),
          gte(sessions.scheduledStart, sinceYesterday),
          isNull(sessions.mergedIntoId)
        );

    const sessionRows = await db.query.sessions.findMany({
      where: sessionWhere,
      with: {
        teacher: { columns: { id: true, name: true, email: true } },
        bookings: {
          with: {
            studentProfile: { columns: { id: true, name: true, track: true } },
          },
        },
      },
      orderBy: [asc(sessions.scheduledStart)],
      limit: 300,
    });

    const initialClasses: ScheduledClassRow[] = sessionRows.map((s) => {
      const firstStudent = s.bookings[0]?.studentProfile;
      const studentNames = s.bookings
        .map((b) => b.studentProfile?.name)
        .filter(Boolean)
        .join(", ");

      return {
        id: s.id,
        title: s.title || "Quran Lesson",
        track: s.track || firstStudent?.track || "QAIDAH",
        origin: s.origin || "SCHEDULED",
        teacherId: s.teacherId,
        teacherName: s.teacher?.name || s.teacher?.email || "Teacher",
        teacherEmail: s.teacher?.email || "",
        studentNames: studentNames || "No students assigned",
        studentProfileId: firstStudent?.id,
        scheduledStart: s.scheduledStart ? new Date(s.scheduledStart).toISOString() : new Date().toISOString(),
        scheduledEnd: s.scheduledEnd ? new Date(s.scheduledEnd).toISOString() : new Date().toISOString(),
        status: s.status,
      };
    });

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
              <span>Scheduled Classes</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
              Scheduled Classes Matrix
            </h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Complete timetable of future classes, teacher assignments, and booking status across the organization.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              href="/admin/teacher-schedules"
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border)] hover:bg-[var(--bg-secondary)] transition flex items-center gap-1.5"
            >
              <span>📊</span> Teacher Spreadsheet
            </Link>
            <Link
              href="/admin/assign-student"
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition flex items-center gap-1.5"
            >
              <span>+</span> Assign Student
            </Link>
          </div>
        </div>

        {/* Interactive Scheduled Classes Table */}
        <ScheduledClassesTable initialClasses={initialClasses} teachers={teacherOptions} />
      </div>
    );
  });
}
