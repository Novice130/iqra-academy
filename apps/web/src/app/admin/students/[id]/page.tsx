/**
 * @fileoverview /admin/students/[id] — everything about one learner on one page.
 *
 * `id` is a studentProfiles id. A profile in another org is a 404, not a 403,
 * so an ORG_ADMIN can't probe for ids that exist elsewhere.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import LocalTime from "@/components/LocalTime";
import { withHttpDb } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin-page";
import { loadStudent360 } from "@/lib/admin-students";
import { money } from "@/lib/money";
import { Badge, PageHeader, StatCard, StatGrid, btn, humanize } from "../../_components/ui";
import ProfilePanel from "./ProfilePanel";
import { RecentPanel, SlotsPanel, UpcomingPanel } from "./ClassPanels";
import { BillingPanel, FamilyPanel, ObserversPanel, ProgressPanel } from "./AccountPanels";

export const dynamic = "force-dynamic";

export default async function AdminStudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withHttpDb(async () => {
    const admin = await requireAdminPage(`/admin/students/${id}`);
    const data = await loadStudent360(admin, id);
    if (!data) notFound();

    const { profile, family, attendance, billing } = data;
    const next = data.upcoming[0];

    return (
      <div className="space-y-6">
        <PageHeader
          title={profile.name}
          crumbs={[
            { label: "Admin", href: "/admin" },
            { label: "Students", href: "/admin/students" },
            { label: profile.name },
          ]}
          description={
            <span className="inline-flex flex-wrap items-center gap-2">
              <Badge tone="info">{humanize(profile.track)}</Badge>
              <span>Family account: {family.name}</span>
            </span>
          }
          actions={
            <>
              <Link href={`/dashboard/chat?studentId=${encodeURIComponent(family.id)}&studentName=${encodeURIComponent(family.name)}`} className={btn.secondary}>
                Message family
              </Link>
              <Link href={`/admin/invoices?userId=${encodeURIComponent(family.id)}`} className={btn.secondary}>
                Issue invoice
              </Link>
              <Link href={`/admin/assign-student?studentId=${encodeURIComponent(profile.id)}`} className={btn.primary}>
                Book a class
              </Link>
            </>
          }
        />

        <StatGrid>
          <StatCard
            label="Next class"
            value={next ? <span className="text-base"><LocalTime iso={next.startsAt} mode="date-time" /></span> : "None"}
            hint={next ? next.teacherName : "Nothing booked"}
            tone={next ? "neutral" : "warning"}
          />
          <StatCard
            label={`Attendance (${attendance.windowDays}d)`}
            value={attendance.rate === null ? "—" : `${attendance.rate}%`}
            hint={attendance.expected ? `${attendance.present + attendance.late} of ${attendance.expected} classes` : "No past classes"}
            tone={attendance.rate !== null && attendance.rate < 75 ? "warning" : "neutral"}
          />
          <StatCard label="Late arrivals" value={attendance.late} hint="More than 5 minutes late" tone={attendance.late ? "warning" : "neutral"} />
          <StatCard label="Absences" value={attendance.absent} tone={attendance.absent ? "danger" : "neutral"} />
          <StatCard
            label="Outstanding"
            value={
              billing.unpaidCount === 0
                ? "None"
                : billing.outstandingCurrency
                  ? money(billing.outstandingCents, billing.outstandingCurrency)
                  : `${billing.unpaidCount} invoices`
            }
            tone={billing.invoices.some((i) => i.status === "OVERDUE") ? "danger" : billing.unpaidCount ? "warning" : "neutral"}
            href={`/admin/invoices?userId=${encodeURIComponent(family.id)}`}
          />
        </StatGrid>

        <div className="grid gap-6 lg:grid-cols-2">
          <ProfilePanel profile={profile} familyZone={family.timezone} />
          <FamilyPanel data={data} />
          <SlotsPanel data={data} />
          <BillingPanel data={data} />
        </div>

        <UpcomingPanel data={data} />
        <RecentPanel data={data} />

        <div className="grid gap-6 lg:grid-cols-2">
          <ProgressPanel data={data} />
          <ObserversPanel data={data} />
        </div>
      </div>
    );
  });
}
