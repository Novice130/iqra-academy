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
import { ViewerTimeZoneProvider } from "@/components/LocalTime";

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
      columns: { role: true, timezone: true },
    });

    const user = { ...session.user, role: dbUser?.role || "STUDENT" } as { name?: string; email?: string; role?: string };

    // Every time on every dashboard page renders through this. Without it the
    // browser's zone is the only signal, and a device set to the wrong country
    // silently shows the wrong hour for the class.
    return (
      <ViewerTimeZoneProvider timeZone={dbUser?.timezone ?? null}>
        <DashboardChrome user={user}>{children}</DashboardChrome>
      </ViewerTimeZoneProvider>
    );
  });
}
