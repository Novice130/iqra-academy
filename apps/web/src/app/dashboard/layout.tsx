/**
 * Dashboard Layout — auth guard, delegates chrome to DashboardChrome.
 *
 * Server component — checks auth and redirects if not logged in.
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

import { db, withHttpDb } from "@/lib/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import DashboardChrome from "./DashboardChrome";
import { ViewerTimeZoneProvider } from "@/components/LocalTime";
import TimeZoneConfirmBanner from "@/components/TimeZoneConfirmBanner";
import { resolveViewerZone } from "@/lib/viewer-zone";
import { isNativeAppUserAgent } from "@/lib/native-app";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return withHttpDb(async () => {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });

    if (!session) {
      redirect("/login");
    }

    const dbUser = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: { role: true, timezone: true },
    });

    const user = { ...session.user, role: dbUser?.role || "STUDENT" } as { name?: string; email?: string; role?: string };

    // The same headers the session came from — no second read needed. Decided
    // here rather than in the root layout so the marketing pages stay static;
    // this route is dynamic anyway because it reads the session.
    const nativeApp = isNativeAppUserAgent(headersList.get("user-agent"));

    // Every time on every dashboard page renders through this. Without it the
    // browser's zone is the only signal, and a device set to the wrong country
    // silently shows the wrong hour for the class.
    //
    // Their own setting wins; failing that we use the zone Cloudflare derives
    // from their IP, which beats the handset for the traveller-with-a-stale-
    // phone case. `source` travels with it so the banner can offer to save an
    // IP guess rather than us writing it behind their back — see
    // lib/viewer-zone.ts for why that distinction matters.
    const { timeZone, source } = await resolveViewerZone(dbUser?.timezone);

    return (
      <ViewerTimeZoneProvider timeZone={timeZone} source={source}>
        <DashboardChrome user={user} nativeApp={nativeApp}>
          <TimeZoneConfirmBanner />
          {children}
        </DashboardChrome>
      </ViewerTimeZoneProvider>
    );
  });
}
