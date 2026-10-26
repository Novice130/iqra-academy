/**
 * @fileoverview /admin/assign-student — book a student with a teacher, once
 * or weekly.
 *
 * Prefill from the query string, so the teacher spreadsheet and the class
 * pages can link straight to a filled-in form:
 *   ?studentId=<studentProfileId>&teacherId=<userId>&date=YYYY-MM-DD&time=HH:mm&tz=<IANA zone>
 * Every parameter is optional; anything malformed or out of scope is ignored
 * rather than trusted. `date`/`time` are a wall clock in `tz` when given,
 * otherwise in the viewer's zone.
 *
 * Scope: an ORG_ADMIN sees their own org's students and teachers. A
 * SUPER_ADMIN sees every org's, and the form narrows the teacher list to the
 * chosen student's org — the API refuses a booking across two orgs, so the
 * picker never offers one.
 */

import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db, withHttpDb } from "@/lib/db";
import { organizations, studentProfiles, users } from "@/db/schema";
import { orgFilter, requireAdminPage } from "@/lib/admin-page";
import { resolveViewerZone } from "@/lib/viewer-zone";
import { zonedDayParts } from "@/lib/slots";
import { isValidZone } from "@/lib/zones";
import { PageHeader } from "@/app/admin/_components/ui";
import AssignStudentDesk, { type AssignPrefill, type StudentProfileOption, type TeacherOption } from "./AssignStudentDesk";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ studentId?: string; teacherId?: string; date?: string; time?: string; tz?: string }>;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export default async function AssignStudentPage({ searchParams }: Props) {
  return withHttpDb(async () => {
    const admin = await requireAdminPage("/admin/assign-student");
    const q = await searchParams;

    const [profileRows, teacherRows, orgRows, viewer] = await Promise.all([
      db
        .select({
          id: studentProfiles.id,
          name: studentProfiles.name,
          userId: studentProfiles.userId,
          track: studentProfiles.track,
          orgId: studentProfiles.orgId,
          userEmail: users.email,
        })
        .from(studentProfiles)
        .innerJoin(users, eq(studentProfiles.userId, users.id))
        .where(and(isNull(users.deletedAt), orgFilter(admin, studentProfiles.orgId)))
        .orderBy(asc(studentProfiles.name)),
      db.query.users.findMany({
        where: and(
          inArray(users.role, ["TEACHER", "ORG_ADMIN", "SUPER_ADMIN"]),
          isNull(users.deletedAt),
          orgFilter(admin, users.orgId)
        ),
        columns: { id: true, name: true, email: true, timezone: true, orgId: true },
        orderBy: [asc(users.name)],
      }),
      admin.isSuperAdmin
        ? db.select({ id: organizations.id, name: organizations.name }).from(organizations)
        : Promise.resolve([] as { id: string; name: string }[]),
      resolveViewerZone(admin.timezone),
    ]);

    const orgName = new Map(orgRows.map((o) => [o.id, o.name]));
    const students: StudentProfileOption[] = profileRows.map((p) => ({
      ...p,
      orgName: admin.isSuperAdmin ? orgName.get(p.orgId) ?? null : null,
    }));
    const teachers: TeacherOption[] = teacherRows.map((t) => ({ ...t, name: t.name || t.email }));

    // Only ids this admin can actually see are honoured.
    const prefill: AssignPrefill = {
      studentId: students.some((s) => s.id === q.studentId) ? q.studentId! : null,
      teacherId: teachers.some((t) => t.id === q.teacherId) ? q.teacherId! : null,
      date: q.date && DATE_RE.test(q.date) ? q.date : null,
      time: q.time && TIME_RE.test(q.time) ? q.time : null,
      timeZone: q.tz && isValidZone(q.tz) ? q.tz : null,
    };

    const t = zonedDayParts(new Date(Date.now() + 24 * 60 * 60 * 1000), viewer.timeZone ?? "UTC");
    const tomorrow = `${t.y}-${String(t.m).padStart(2, "0")}-${String(t.d).padStart(2, "0")}`;

    return (
      <div className="space-y-6">
        <PageHeader
          crumbs={[
            { label: "Admin", href: "/admin" },
            { label: "Scheduled classes", href: "/admin/scheduled-classes" },
            { label: "Assign student" },
          ]}
          title="Assign student"
          description="Book a student with a teacher, once or every week. Each class is checked against the teacher's other classes and time off, and the student's other classes."
        />
        <AssignStudentDesk students={students} teachers={teachers} prefill={prefill} defaultDate={tomorrow} />
      </div>
    );
  });
}
