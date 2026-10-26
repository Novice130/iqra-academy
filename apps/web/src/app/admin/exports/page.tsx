/**
 * @fileoverview /admin/exports — CSV downloads of the school's data.
 *
 * One card per dataset; each calls GET /api/admin/exports, which does the
 * scoping, quoting and audit logging. The "Recent exports" list is read back
 * from those audit entries, so it shows who took a copy of what and when.
 */

import { and, desc, eq } from "drizzle-orm";
import { db, withHttpDb } from "@/lib/db";
import { auditLogs, users } from "@/db/schema";
import { orgFilter, requireAdminPage } from "@/lib/admin-page";
import { EmptyState, PageHeader, Panel, humanize, table } from "../_components/ui";
import ExportCard, { type ExportDataset } from "./ExportCard";
import LocalTime from "@/components/LocalTime";

export const dynamic = "force-dynamic";

const DATASETS: ExportDataset[] = [
  {
    type: "students",
    title: "Students",
    description: "Every student profile with their track, level, family contact and assigned teachers.",
  },
  {
    type: "users",
    title: "Users",
    description: "Every account: families, teachers and admins, with role, phone and time zone.",
  },
  {
    type: "sessions",
    title: "Classes",
    description: "Classes scheduled in the range: time, type, status, teacher and how many students were booked.",
    ranged: true,
  },
  {
    type: "attendance",
    title: "Attendance",
    description: "One row per person per class: present, late or absent, join and leave times, minutes in class.",
    ranged: true,
  },
  {
    type: "invoices",
    title: "Invoices",
    description: "Invoices issued in the range, with amounts due and paid, due dates and notes.",
    ranged: true,
    statuses: true,
  },
];

export default async function AdminExportsPage() {
  return withHttpDb(async () => {
    const admin = await requireAdminPage("/admin/exports");

    const recent = await db
      .select({
        id: auditLogs.id,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
        actor: users.name,
        actorEmail: users.email,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorId))
      .where(and(eq(auditLogs.action, "EXPORT_GENERATED"), orgFilter(admin, auditLogs.orgId)))
      .orderBy(desc(auditLogs.createdAt))
      .limit(10);

    return (
      <div className="space-y-6">
        <PageHeader
          title="Exports"
          description="Download your school's data as CSV files that open cleanly in Excel, Numbers or Google Sheets. Up to 50,000 rows per file; a longer file is cut off and its name ends in -truncated."
          crumbs={[{ label: "Admin", href: "/admin" }, { label: "Exports" }]}
        />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {DATASETS.map((d) => (
            <ExportCard key={d.type} dataset={d} />
          ))}
        </div>

        <Panel title="Recent exports" description="Every download is recorded in the audit log." flush>
          {recent.length === 0 ? (
            <EmptyState title="No exports yet" body="Downloads made from this page will be listed here." />
          ) : (
            <div className={table.wrap}>
              <table className={`${table.table} min-w-[560px]`}>
                <thead>
                  <tr>
                    <th scope="col" className={table.th}>When</th>
                    <th scope="col" className={table.th}>Who</th>
                    <th scope="col" className={table.th}>Dataset</th>
                    <th scope="col" className={table.th}>Range</th>
                    <th scope="col" className={`${table.th} text-right`}>Rows</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r) => {
                    const m = (r.metadata ?? {}) as { type?: string; from?: string | null; to?: string | null; rows?: number; status?: string | null };
                    return (
                      <tr key={r.id} className={table.tr}>
                        <td className={`${table.td} whitespace-nowrap`}><LocalTime iso={r.createdAt.toISOString()} mode="date-time" /></td>
                        <td className={table.td}>{r.actor || r.actorEmail || "Unknown"}</td>
                        <td className={table.td}>
                          {m.type ? humanize(m.type) : "—"}
                          {m.status ? ` (${humanize(m.status)})` : ""}
                        </td>
                        <td className={`${table.td} whitespace-nowrap text-[var(--text-secondary)]`}>
                          {m.from && m.to ? `${m.from} to ${m.to}` : "All"}
                        </td>
                        <td className={`${table.td} text-right tabular-nums`}>{m.rows ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    );
  });
}
