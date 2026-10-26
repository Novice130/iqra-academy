/**
 * @fileoverview /admin/students — every learner in the org, one row each.
 *
 * A row is a child profile, not a family login: a family with three children
 * is three students here, each with their own teacher, classes and
 * attendance, and the family's billing state shown against all three.
 */

import Link from "next/link";
import { withHttpDb } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin-page";
import { loadStudentList } from "@/lib/admin-students";
import { PageHeader, Panel, StatCard, StatGrid, btn } from "../_components/ui";
import StudentsTable from "./StudentsTable";

export const dynamic = "force-dynamic";

export default async function AdminStudentsPage() {
  return withHttpDb(async () => {
    const admin = await requireAdminPage("/admin/students");
    const rows = await loadStudentList(admin);

    const unpaid = rows.filter((r) => r.billing).length;
    const overdue = rows.filter((r) => r.billing === "OVERDUE").length;
    const noUpcoming = rows.filter((r) => !r.nextClassAt).length;
    const unassigned = rows.filter((r) => !r.teacherId).length;
    const families = new Set(rows.map((r) => r.familyUserId)).size;

    return (
      <div className="space-y-6">
        <PageHeader
          title="Students"
          description="Every child profile, with their teacher, classes and the family's billing state."
          crumbs={[{ label: "Admin", href: "/admin" }, { label: "Students" }]}
          actions={
            <>
              <Link href="/admin/exports" className={btn.secondary}>Export</Link>
              <Link href="/admin/assign-student" className={btn.primary}>Book a class</Link>
            </>
          }
        />

        <StatGrid>
          <StatCard label="Students" value={rows.length} hint={`${families} family accounts`} />
          <StatCard label="No upcoming class" value={noUpcoming} tone={noUpcoming ? "warning" : "neutral"} />
          <StatCard label="No teacher yet" value={unassigned} tone={unassigned ? "warning" : "neutral"} />
          <StatCard label="Unpaid invoices" value={unpaid} hint="Students whose family owes" tone={unpaid ? "warning" : "neutral"} />
          <StatCard label="Overdue" value={overdue} tone={overdue ? "danger" : "neutral"} href="/admin/invoices" />
        </StatGrid>

        <Panel flush>
          <StudentsTable rows={rows} />
        </Panel>
      </div>
    );
  });
}
