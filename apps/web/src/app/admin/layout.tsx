/**
 * Admin Layout — auth guard, wraps with DashboardChrome.
 *
 * Integrates /admin seamlessly into the main website's layout and sidebar.
 * Pages call `requireAdminPage()` too; it is memoised per request, so that
 * second call costs nothing and gives the page its typed context.
 */

import { headers } from "next/headers";
import { withHttpDb } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin-page";
import DashboardChrome from "../dashboard/DashboardChrome";
import { ViewerTimeZoneProvider } from "@/components/LocalTime";
import { resolveViewerZone } from "@/lib/viewer-zone";
import { isNativeAppUserAgent } from "@/lib/native-app";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return withHttpDb(async () => {
    const admin = await requireAdminPage();
    const headersList = await headers();

    const user = { name: admin.name ?? undefined, email: admin.email, role: admin.role };
    const nativeApp = isNativeAppUserAgent(headersList.get("user-agent"));
    const { timeZone, source } = await resolveViewerZone(admin.timezone);

    return (
      <ViewerTimeZoneProvider timeZone={timeZone} source={source}>
        <DashboardChrome user={user} nativeApp={nativeApp}>
          <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
            {children}
          </div>
        </DashboardChrome>
      </ViewerTimeZoneProvider>
    );
  });
}
