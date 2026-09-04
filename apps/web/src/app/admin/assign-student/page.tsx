/**
 * @fileoverview Admin Assign Student Page
 *
 * RBAC: ORG_ADMIN, SUPER_ADMIN
 * Server page loading students and teachers and rendering AssignStudentDesk.
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canAccessAdmin } from "@/lib/admin";
import { db, withDb } from "@/lib/db";
import { studentProfiles, users } from "@/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import AssignStudentDesk, {
  type StudentProfileOption,
  type TeacherOption,
} from "./AssignStudentDesk";

export default async function AssignStudentPage() {
  return withDb(async () => {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session) {
      redirect("/login?redirect=/admin/assign-student");
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

    // 1. Fetch student profiles in this org with user email
    const studentConditions = [isNull(users.deletedAt)];
    if (!isSuperAdmin) {
      studentConditions.push(eq(studentProfiles.orgId, orgId));
    }

    const rawProfiles = await db
      .select({
        id: studentProfiles.id,
        name: studentProfiles.name,
        userId: studentProfiles.userId,
        track: studentProfiles.track,
        userEmail: users.email,
        deletedAt: users.deletedAt,
      })
      .from(studentProfiles)
      .innerJoin(users, eq(studentProfiles.userId, users.id))
      .where(and(...studentConditions));

    const students: StudentProfileOption[] = rawProfiles.map((p) => ({
      id: p.id,
      name: p.name,
      userId: p.userId,
      userEmail: p.userEmail,
      track: p.track,
    }));

    // 2. Fetch teachers in this org
    const teacherConditions = [
      inArray(users.role, ["TEACHER", "ORG_ADMIN", "SUPER_ADMIN"]),
      isNull(users.deletedAt),
    ];
    if (!isSuperAdmin) {
      teacherConditions.push(eq(users.orgId, orgId));
    }

    const rawTeachers = await db.query.users.findMany({
      where: and(...teacherConditions),
      columns: {
        id: true,
        name: true,
        email: true,
        timezone: true,
      },
    });

    const teachers: TeacherOption[] = rawTeachers.map((t) => ({
      id: t.id,
      name: t.name,
      email: t.email,
      timezone: t.timezone,
    }));

    return <AssignStudentDesk students={students} teachers={teachers} />;
  });
}
