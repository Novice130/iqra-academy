/**
 * Attendance — who turned up to each class, and when.
 *
 * WHY IT LIVES UNDER /dashboard AND NOT /admin: only the dashboard layout
 * wraps its children in `ViewerTimeZoneProvider`, and this whole page is about
 * times. The teacher is in India joining at 4:30 AM, the students are in
 * Illinois and New York joining at 6 PM and 7 PM, and those are the same
 * instant. Rendered anywhere else — or formatted on the server, which runs in
 * UTC on Workers — every one of those times is wrong for somebody. See
 * docs/timezones.md.
 *
 * The server's only job here is to fetch a *generous* window and hand it over
 * as ISO strings. Which classes fall on "today" is a question the browser
 * answers, because only the browser knows whose today.
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, withHttpDb } from "@/lib/db";
import { users } from "@/db/schema";
import { getAttendanceReport } from "@/lib/attendance";
import AttendanceReport from "./AttendanceReport";

/** How far back the report reaches. Long enough to cover a month of classes. */
const LOOKBACK_DAYS = 45;

export default async function AttendancePage() {
  // Read-only, no transaction: the HTTP driver, not the pooled one. A pooled
  // connection on a page like this is what pushed the Worker past its 128 MB
  // ceiling before — see the comment in lib/db.ts.
  return withHttpDb(async () => {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session) redirect("/login?redirect=/dashboard/attendance");

    // Never `session.user.role` — betterAuth is configured without
    // `user.additionalFields`, so it is always undefined and every role check
    // against it silently fails open to STUDENT.
    const dbUser = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: { id: true, role: true, orgId: true },
    });
    if (!dbUser) redirect("/login");

    const role = dbUser.role || "STUDENT";
    const isAdmin = ["ORG_ADMIN", "SUPER_ADMIN"].includes(role);
    const isTeacher = role === "TEACHER";
    if (!isAdmin && !isTeacher) redirect("/dashboard");

    const now = Date.now();
    // A day wider on each side than anything the client will show: the server
    // is UTC, so a class at the edge of the viewer's local day has to already
    // be in the payload for the client to be able to find it.
    const from = new Date(now - (LOOKBACK_DAYS + 1) * 24 * 60 * 60 * 1000);
    const to = new Date(now + 1 * 24 * 60 * 60 * 1000);

    const occurrences = await getAttendanceReport({
      orgId: dbUser.orgId,
      // A teacher sees their own classes; an admin sees the whole org.
      ...(isAdmin ? {} : { teacherId: dbUser.id }),
      from,
      to,
    });

    return <AttendanceReport occurrences={occurrences} isAdmin={isAdmin} />;
  });
}
