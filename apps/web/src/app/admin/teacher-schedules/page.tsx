/**
 * @fileoverview Teacher Schedules Spreadsheet Page
 *
 * Route: /admin/teacher-schedules
 * Server component that aggregates teacher availability, time-off, and scheduled sessions
 * for the selected week, rendering the dense TeacherSpreadsheet.
 */

import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canAccessAdmin } from "@/lib/admin";
import { db, withDb } from "@/lib/db";
import { users, teacherAvailability, teacherTimeOff, sessions } from "@/db/schema";
import { startOfWeek, addDays } from "date-fns";
import { asc, and, eq, isNull, inArray, gte, lte } from "drizzle-orm";
import TeacherSpreadsheet, { type TeacherScheduleData } from "./TeacherSpreadsheet";

interface Props {
  searchParams: Promise<{ week?: string }>;
}

export default async function AdminTeacherSchedulesPage({ searchParams }: Props) {
  return withDb(async () => {
    const p = await searchParams;
    const weekOffset = parseInt(p.week || "0", 10) || 0;

    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session) redirect("/login?redirect=/admin/teacher-schedules");

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

    // Compute week window
    const today = new Date();
    const currentWeekStart = startOfWeek(today, { weekStartsOn: 0 }); // Sunday start
    const weekStart = addDays(currentWeekStart, weekOffset * 7);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = addDays(weekStart, 7);
    weekEnd.setHours(23, 59, 59, 999);

    // 1. Fetch active teachers in org
    const teacherRows = await db.query.users.findMany({
      where: isSuperAdmin
        ? and(inArray(users.role, ["TEACHER", "ORG_ADMIN", "SUPER_ADMIN"]), isNull(users.deletedAt))
        : and(
            inArray(users.role, ["TEACHER", "ORG_ADMIN", "SUPER_ADMIN"]),
            eq(users.orgId, orgId),
            isNull(users.deletedAt)
          ),
      columns: { id: true, name: true, email: true, timezone: true },
      orderBy: [asc(users.name)],
    });

    const teacherIds = teacherRows.map((t) => t.id);

    if (teacherIds.length === 0) {
      return (
        <div className="space-y-6">
          <div className="pb-6 border-b border-[var(--border)]">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
              Teacher Schedules Spreadsheet
            </h1>
          </div>
          <div className="p-12 text-center card">
            <p className="text-sm text-[var(--text-secondary)]">No teachers found in this organization.</p>
          </div>
        </div>
      );
    }

    // 2. Fetch all availability, time-off, and sessions for these teachers concurrently
    const [availabilityRows, timeOffRows, sessionRows] = await Promise.all([
      db.query.teacherAvailability.findMany({
        where: inArray(teacherAvailability.teacherId, teacherIds),
      }),
      db.query.teacherTimeOff.findMany({
        where: and(
          inArray(teacherTimeOff.teacherId, teacherIds),
          gte(teacherTimeOff.endsAt, weekStart),
          lte(teacherTimeOff.startsAt, weekEnd)
        ),
      }),
      db.query.sessions.findMany({
        where: and(
          inArray(sessions.teacherId, teacherIds),
          gte(sessions.scheduledStart, weekStart),
          lte(sessions.scheduledStart, weekEnd),
          isNull(sessions.mergedIntoId)
        ),
        with: {
          bookings: {
            with: {
              studentProfile: { columns: { name: true, track: true } },
            },
          },
        },
      }),
    ]);

    // Group data by teacher
    const availabilityByTeacher = new Map<string, typeof availabilityRows>();
    for (const a of availabilityRows) {
      const list = availabilityByTeacher.get(a.teacherId) || [];
      list.push(a);
      availabilityByTeacher.set(a.teacherId, list);
    }

    const timeOffByTeacher = new Map<string, typeof timeOffRows>();
    for (const to of timeOffRows) {
      const list = timeOffByTeacher.get(to.teacherId) || [];
      list.push(to);
      timeOffByTeacher.set(to.teacherId, list);
    }

    const sessionsByTeacher = new Map<string, typeof sessionRows>();
    for (const s of sessionRows) {
      const list = sessionsByTeacher.get(s.teacherId) || [];
      list.push(s);
      sessionsByTeacher.set(s.teacherId, list);
    }

    const DAY_ENUM_TO_INT: Record<string, number> = {
      SUNDAY: 0,
      MONDAY: 1,
      TUESDAY: 2,
      WEDNESDAY: 3,
      THURSDAY: 4,
      FRIDAY: 5,
      SATURDAY: 6,
    };

    const teacherData: TeacherScheduleData[] = teacherRows.map((t) => {
      const rawAvail = availabilityByTeacher.get(t.id) || [];
      const rawTimeOff = timeOffByTeacher.get(t.id) || [];
      const rawSessions = sessionsByTeacher.get(t.id) || [];

      return {
        id: t.id,
        name: t.name || t.email || "Teacher",
        email: t.email || "",
        timezone: t.timezone || "UTC",
        availability: rawAvail.map((a) => ({
          dayOfWeek: DAY_ENUM_TO_INT[a.dayOfWeek] ?? 0,
          startTime: a.startTime,
          endTime: a.endTime,
        })),
        timeOff: rawTimeOff.map((to) => ({
          startsAt: to.startsAt ? new Date(to.startsAt).toISOString() : new Date().toISOString(),
          endsAt: to.endsAt ? new Date(to.endsAt).toISOString() : new Date().toISOString(),
          reason: to.reason,
        })),
        sessions: rawSessions.map((s) => ({
          id: s.id,
          title: s.title || "Lesson",
          track: s.track || "QAIDAH",
          studentNames: s.bookings.map((b) => b.studentProfile?.name).filter(Boolean).join(", ") || "No student",
          scheduledStart: s.scheduledStart ? new Date(s.scheduledStart).toISOString() : new Date().toISOString(),
          scheduledEnd: s.scheduledEnd ? new Date(s.scheduledEnd).toISOString() : new Date().toISOString(),
          status: s.status,
        })),
      };
    });

    return (
      <div className="space-y-6 animate-fadeIn">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[var(--border)]">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-secondary)] mb-1">
              <Link href="/admin" className="hover:text-[var(--accent)] transition">
                Admin
              </Link>
              <span>/</span>
              <span>Teacher Schedules</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
              Teacher Schedules Spreadsheet
            </h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Dense weekly grid mapping teacher declared availability, booked classes, and approved time off.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              href="/admin/scheduled-classes"
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border)] hover:bg-[var(--bg-secondary)] transition flex items-center gap-1.5"
            >
              <span>📅</span> Scheduled Matrix
            </Link>
            <Link
              href="/admin/assign-student"
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition flex items-center gap-1.5"
            >
              <span>+</span> Assign Student
            </Link>
          </div>
        </div>

        {/* Dense Spreadsheet Component */}
        <TeacherSpreadsheet
          teachers={teacherData}
          weekOffset={weekOffset}
          weekStartIso={weekStart.toISOString()}
        />
      </div>
    );
  });
}
