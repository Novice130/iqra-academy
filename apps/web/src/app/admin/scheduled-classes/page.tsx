/**
 * @fileoverview /admin/scheduled-classes — every class from yesterday on,
 * filterable, each linking to its /admin/sessions/[id] page.
 *
 * The window starts 24 hours back (an instant, not a server-zone midnight) so
 * that "today" in any viewer's zone is fully covered; the table groups rows
 * into days in the viewer's zone on the client.
 */

import Link from "next/link";
import { and, asc, gte, inArray, isNull } from "drizzle-orm";
import { db, withHttpDb } from "@/lib/db";
import { sessions, users } from "@/db/schema";
import { orgFilter, requireAdminPage } from "@/lib/admin-page";
import { PageHeader, btn } from "@/app/admin/_components/ui";
import ScheduledClassesTable, { type ScheduledClassRow, type TeacherFilterOption } from "./ScheduledClassesTable";

export const dynamic = "force-dynamic";

const LIMIT = 500;

export default async function AdminScheduledClassesPage() {
  return withHttpDb(async () => {
    const admin = await requireAdminPage("/admin/scheduled-classes");
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [teacherRows, sessionRows] = await Promise.all([
      db.query.users.findMany({
        where: and(
          inArray(users.role, ["TEACHER", "ORG_ADMIN", "SUPER_ADMIN"]),
          isNull(users.deletedAt),
          orgFilter(admin, users.orgId)
        ),
        columns: { id: true, name: true, email: true },
        orderBy: [asc(users.name)],
      }),
      db.query.sessions.findMany({
        where: and(gte(sessions.scheduledStart, since), isNull(sessions.mergedIntoId), orgFilter(admin, sessions.orgId)),
        with: {
          teacher: { columns: { id: true, name: true, email: true } },
          bookings: {
            columns: { status: true },
            with: { studentProfile: { columns: { id: true, name: true, track: true } } },
          },
        },
        orderBy: [asc(sessions.scheduledStart)],
        limit: LIMIT,
      }),
    ]);

    const teachers: TeacherFilterOption[] = teacherRows.map((t) => ({ id: t.id, name: t.name || t.email || "Teacher" }));

    const classes: ScheduledClassRow[] = sessionRows.map((s) => {
      const booked = s.bookings.filter((b) => b.status !== "CANCELLED");
      const shown = booked.length > 0 ? booked : s.bookings;
      const names = shown.map((b) => b.studentProfile?.name).filter(Boolean).join(", ");
      return {
        id: s.id,
        title: s.title || "Quran lesson",
        track: s.track || shown[0]?.studentProfile?.track || "QAIDAH",
        origin: s.origin,
        teacherId: s.teacherId,
        teacherName: s.teacher?.name || s.teacher?.email || "Teacher",
        teacherEmail: s.teacher?.email || "",
        studentNames: names,
        scheduledStart: new Date(s.scheduledStart).toISOString(),
        scheduledEnd: new Date(s.scheduledEnd).toISOString(),
        status: s.status,
      };
    });

    return (
      <div className="space-y-6">
        <PageHeader
          crumbs={[{ label: "Admin", href: "/admin" }, { label: "Scheduled classes" }]}
          title="Scheduled classes"
          description={
            sessionRows.length === LIMIT
              ? `Classes from yesterday on. Showing the first ${LIMIT}; narrow with the filters.`
              : "Classes from yesterday on. Open a class to cancel, reschedule or change its teacher."
          }
          actions={
            <>
              <Link href="/admin/teacher-schedules" className={btn.secondary}>
                Teacher schedules
              </Link>
              <Link href="/admin/assign-student" className={btn.primary}>
                Assign student
              </Link>
            </>
          }
        />
        <ScheduledClassesTable initialClasses={classes} teachers={teachers} />
      </div>
    );
  });
}
