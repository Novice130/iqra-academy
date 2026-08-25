/**
 * Admin Layout — auth guard, wraps with DashboardChrome.
 *
 * Integrates /admin seamlessly into the main website's layout and sidebar.
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db, withDb } from "@/lib/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { canAccessAdmin } from "@/lib/admin";
import DashboardChrome from "../dashboard/DashboardChrome";
import { ViewerTimeZoneProvider } from "@/components/LocalTime";
import { resolveViewerZone } from "@/lib/viewer-zone";
import { isNativeAppUserAgent } from "@/lib/native-app";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return withDb(async () => {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });

    if (!session) {
      redirect("/login?redirect=/admin");
    }

    const dbUser = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: { role: true, timezone: true },
    });

    const role = dbUser?.role || "STUDENT";
    if (!canAccessAdmin(role)) {
      redirect("/dashboard?error=unauthorized");
    }

    const user = { ...session.user, role } as { name?: string; email?: string; role?: string };
    const nativeApp = isNativeAppUserAgent(headersList.get("user-agent"));
    const { timeZone, source } = await resolveViewerZone(dbUser?.timezone);

    return (
      <ViewerTimeZoneProvider timeZone={timeZone} source={source}>
        <DashboardChrome user={user} nativeApp={nativeApp}>
          <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-8">
            {children}
          </div>
        </DashboardChrome>
      </ViewerTimeZoneProvider>
    );
  });
}
