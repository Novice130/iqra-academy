/**
 * Teacher Layout — guards all /dashboard/teacher/** pages.
 *
 * RBAC: TEACHER, ORG_ADMIN, SUPER_ADMIN
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db, withHttpDb } from "@/lib/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return withHttpDb(async () => {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });

    if (!session) {
      redirect("/login?redirect=/dashboard/teacher");
    }

    const dbUser = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: { role: true },
    });

    const role = dbUser?.role || "STUDENT";
    if (!["TEACHER", "ORG_ADMIN", "SUPER_ADMIN"].includes(role)) {
      redirect("/dashboard?error=unauthorized");
    }

    return <>{children}</>;
  });
}
