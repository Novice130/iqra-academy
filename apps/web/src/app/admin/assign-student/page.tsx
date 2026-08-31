/**
 * @fileoverview Admin Assign Student Page
 *
 * RBAC: ORG_ADMIN, SUPER_ADMIN
 * Server page loading students and teachers and rendering AssignStudentDesk.
 */

import { db, withDb } from "@/lib/db";
import { studentProfiles, users } from "@/db/schema";
import { eq, inArray, isNull } from "drizzle-orm";
import AssignStudentDesk, {
  type StudentProfileOption,
  type TeacherOption,
} from "./AssignStudentDesk";

export default async function AssignStudentPage() {
  return withDb(async () => {
    // 1. Fetch all student profiles with user email
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
      .where(isNull(users.deletedAt));

    const students: StudentProfileOption[] = rawProfiles.map((p) => ({
      id: p.id,
      name: p.name,
      userId: p.userId,
      userEmail: p.userEmail,
      track: p.track,
    }));

    // 2. Fetch all teachers
    const rawTeachers = await db.query.users.findMany({
      where: inArray(users.role, ["TEACHER", "ORG_ADMIN", "SUPER_ADMIN"]),
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
