/**
 * @fileoverview /admin/scheduled-classes — every class from yesterday on,
 * one entry per class (not per session row), filtered and paged on the
 * server (see ./load.ts), each linking to its /admin/sessions/[id] page.
 *
 * Query string: teacher, track, status (ACTIVE default, or ALL or a status),
 * window (7 | 14 | 30 | 90 | ALL days ahead), q (title, teacher or student),
 * page.
 *
 * Days are cut in the viewer's zone, resolved here and passed down, so the
 * server render and the browser agree on which day a class is in.
 */

import Link from "next/link";
import { and, asc, inArray, isNull } from "drizzle-orm";
import { db, withHttpDb } from "@/lib/db";
import { users } from "@/db/schema";
import { orgFilter, requireAdminPage } from "@/lib/admin-page";
import { resolveViewerZone } from "@/lib/viewer-zone";
import { PageHeader, btn } from "@/app/admin/_components/ui";
import ScheduledClassesTable from "./ScheduledClassesTable";
import ScheduledClassFilters from "./ScheduledClassFilters";
import { loadScheduledClasses, parseFilters } from "./load";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function AdminScheduledClassesPage({ searchParams }: Props) {
  return withHttpDb(async () => {
    const admin = await requireAdminPage("/admin/scheduled-classes");
    const filters = parseFilters(await searchParams);

    const [teacherRows, result, viewer] = await Promise.all([
      db.query.users.findMany({
        where: and(
          inArray(users.role, ["TEACHER", "ORG_ADMIN", "SUPER_ADMIN"]),
          isNull(users.deletedAt),
          orgFilter(admin, users.orgId)
        ),
        columns: { id: true, name: true, email: true },
        orderBy: [asc(users.name)],
      }),
      loadScheduledClasses(admin, filters),
      resolveViewerZone(admin.timezone),
    ]);
    const zone = viewer.timeZone ?? "UTC";
    const teachers = teacherRows.map((t) => ({ id: t.id, name: t.name || t.email || "Teacher" }));

    return (
      <div className="space-y-6">
        <PageHeader
          crumbs={[{ label: "Admin", href: "/admin" }, { label: "Scheduled classes" }]}
          title="Scheduled classes"
          description={
            result.truncated
              ? "Classes from yesterday on. This range is very large; narrow it with the filters to be sure nothing is missed."
              : "Classes from yesterday on. Open a class to cancel, reschedule or change its teacher."
          }
          actions={
            <>
              <Link href="/admin/teacher-schedules" className={btn.secondary}>
                Teacher schedules
              </Link>
              <Link href="/admin/assign-student" className={btn.primary}>
                Assign student
              </Link>
            </>
          }
        />
        <ScheduledClassFilters
          // Remount on navigation so the inputs show the applied values.
          key={JSON.stringify(filters)}
          value={filters}
          teachers={teachers}
          total={result.total}
          zone={zone}
        />
        <ScheduledClassesTable
          classes={result.classes}
          zone={zone}
          filters={filters}
          page={result.page}
          totalPages={result.totalPages}
        />
      </div>
    );
  });
}
