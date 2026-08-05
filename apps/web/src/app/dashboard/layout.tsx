/**
 * Dashboard Layout — auth guard, delegates chrome to DashboardChrome.
 *
 * Server component — checks auth and redirects if not logged in.
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

import { db, withDb } from "@/lib/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import DashboardChrome from "./DashboardChrome";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return withDb(async () => {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });

    if (!session) {
      redirect("/login");
    }

    const dbUser = await db.query.users.findFirst({
      where: eq(users.email, session.user.email),
      columns: { role: true },
    });

    const user = { ...session.user, role: dbUser?.role || "STUDENT" } as { name?: string; email?: string; role?: string };

    return <DashboardChrome user={user}>{children}</DashboardChrome>;
  });
}
