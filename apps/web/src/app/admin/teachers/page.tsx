/**
 * @fileoverview /admin/teachers — every teacher, with this week's load and
 * the last 30 days' hours.
 *
 * The numbers come from lib/admin-teachers.ts, which counts classes as
 * occurrences and hours from the teacher's own attendance, so they agree with
 * the detail page and the attendance report.
 */

import Link from "next/link";
import { withHttpDb } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin-page";
import { resolveViewerZone } from "@/lib/viewer-zone";
import { loadTeacherList } from "@/lib/admin-teachers";
import { EmptyState, PageHeader, Panel, StatCard, StatGrid, btn } from "../_components/ui";
import TeachersTable from "./TeachersTable";

export const dynamic = "force-dynamic";

export default async function AdminTeachersPage() {
  return withHttpDb(async () => {
    const admin = await requireAdminPage("/admin/teachers");
    const zone = (await resolveViewerZone(admin.timezone)).timeZone ?? "UTC";
    const rows = await loadTeacherList(admin, zone);

    const totalSeconds = rows.reduce((n, r) => n + r.secondsLast30, 0);
    const weekClasses = rows.reduce((n, r) => n + r.classesThisWeek, 0);
    const awayNow = rows.filter((r) => r.awayNow).length;

    return (
      <div className="space-y-6">
        <PageHeader
          title="Teachers"
          description="Load this week, hours taught and attendance problems, per teacher. Hours are time the teacher was actually in the room."
          crumbs={[{ label: "Admin", href: "/admin" }, { label: "Teachers" }]}
          actions={
            <>
              <Link href="/admin/teacher-schedules" className={btn.secondary}>
                Teacher schedules
              </Link>
              <Link href="/admin/users?new=teacher" className={btn.primary}>
                Add teacher
              </Link>
            </>
          }
        />

        <StatGrid>
          <StatCard label="Teachers" value={rows.length} />
          <StatCard label="Classes this week" value={weekClasses} hint="Not counting cancelled" />
          <StatCard label="Hours taught, 30 days" value={(totalSeconds / 3600).toFixed(1)} />
          <StatCard
            label="On time off now"
            value={awayNow}
            tone={awayNow > 0 ? "warning" : "neutral"}
          />
        </StatGrid>

        <Panel title="All teachers" flush>
          {rows.length === 0 ? (
            <EmptyState
              title="No teachers yet"
              body="Add a teacher, or promote an existing user to Teacher on the Users page."
              action={
                <Link href="/admin/users?new=teacher" className={btn.primary}>
                  Add teacher
                </Link>
              }
            />
          ) : (
            <TeachersTable rows={rows} />
          )}
        </Panel>
      </div>
    );
  });
}
