/**
 * @fileoverview /admin — the overview an operator opens first.
 *
 * Real figures from lib/admin-metrics.ts (viewer-zone days, occurrences not
 * rows), live rooms from lib/admin-live.ts, and a needs-attention list made
 * only of things we can compute. Each figure links to the page that explains
 * it. The old version carried its own copy of the live-room loader and card,
 * a hardcoded "Healthy" status, and an Instant Meeting button that never
 * opened the room; all three are gone.
 */

import Link from "next/link";
import { withHttpDb } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin-page";
import { resolveViewerZone } from "@/lib/viewer-zone";
import { getAdminOverview, getAttentionSessions, getTodayRemaining } from "@/lib/admin-metrics";
import { getLiveRooms } from "@/lib/admin-live";
import { money } from "@/lib/money";
import StartInstantMeetingButton from "../dashboard/teacher/StartInstantMeetingButton";
import { EmptyState, PageHeader, Panel, StatCard, StatGrid, btn } from "./_components/ui";
import LiveClassCard from "./_components/LiveClassCard";
import OverviewAttention from "./_components/OverviewAttention";
import OverviewToday from "./_components/OverviewToday";

export const dynamic = "force-dynamic";

const LIVE_ON_OVERVIEW = 4;

function totals(list: { currency: string; cents: number }[]): string {
  return list.length ? list.map((t) => money(t.cents, t.currency)).join(" + ") : money(0);
}

export default async function AdminOverviewPage() {
  return withHttpDb(async () => {
    const admin = await requireAdminPage("/admin");
    const { timeZone } = await resolveViewerZone(admin.timezone);
    const zone = timeZone ?? "UTC";

    const [m, live, today, attention] = await Promise.all([
      getAdminOverview(admin, zone),
      getLiveRooms(admin),
      getTodayRemaining(admin, zone),
      getAttentionSessions(admin),
    ]);

    return (
      <div className="space-y-6">
        <PageHeader
          title="Overview"
          crumbs={[{ label: "Admin" }]}
          description={admin.isSuperAdmin ? "All organizations." : undefined}
          actions={
            <>
              <div className="w-full sm:w-64">
                <StartInstantMeetingButton />
              </div>
              <Link href="/admin/assign-student" className={btn.primary}>
                Book a class
              </Link>
              <Link href="/admin/invoices" className={btn.secondary}>
                New invoice
              </Link>
            </>
          }
        />

        <StatGrid>
          <StatCard label="Classes today" value={m.classesToday} hint="Not counting cancelled" href="/admin/scheduled-classes" />
          <StatCard label="Classes this week" value={m.classesThisWeek} hint="Monday to Sunday" href="/admin/scheduled-classes" />
          <StatCard
            label="Live now"
            value={live.unavailable ? "--" : live.rooms.length}
            hint={live.unavailable ? "Video service unreachable" : "Rooms with people connected"}
            tone={live.unavailable ? "danger" : live.rooms.length > 0 ? "info" : "neutral"}
            href="/admin/live-classes"
          />
          <StatCard label="Active students" value={m.activeStudents} hint="Booked in last 30 days or upcoming" href="/admin/students" />
          <StatCard label="Teachers" value={m.teachers} href="/admin/teachers" />
          <StatCard
            label="Upcoming trials"
            value={m.upcomingTrials}
            hint="Booked, not yet held"
            tone={m.upcomingTrials > 0 ? "info" : "neutral"}
            href="/admin/trials"
          />
          <StatCard
            label="Attendance, 30 days"
            value={m.attendanceRate}
            hint={m.attendanceExpected ? `${m.attendanceExpected} student bookings` : "No bookings in range"}
            href="/dashboard/attendance"
          />
          <StatCard
            label="No-shows, 30 days"
            value={m.noShows30d}
            tone={m.noShows30d > 0 ? "warning" : "neutral"}
            href="/dashboard/attendance"
          />
          <StatCard
            label="Cancelled this week"
            value={m.cancelledThisWeek}
            tone={m.cancelledThisWeek > 0 ? "warning" : "neutral"}
            href="/admin/scheduled-classes"
          />
          <StatCard label="Open invoices" value={m.openInvoices} hint="Open or overdue" href="/admin/invoices" />
          <StatCard
            label="Overdue invoices"
            value={m.overdueInvoices}
            hint={m.overdueInvoices ? `${totals(m.overdueAmount)} outstanding` : "None past due"}
            tone={m.overdueInvoices > 0 ? "danger" : "neutral"}
            href="/admin/invoices"
          />
          <StatCard label="Paid this month" value={totals(m.paidThisMonth)} href="/admin/invoices" />
        </StatGrid>

        <OverviewAttention metrics={m} sessions={attention} live={live} />

        <Panel
          title="Live now"
          actions={
            <Link href="/admin/live-classes" className="text-xs font-semibold text-[var(--accent)] hover:underline">
              {live.rooms.length > LIVE_ON_OVERVIEW ? `See all ${live.rooms.length}` : "Live classes"}
            </Link>
          }
        >
          {live.unavailable ? (
            <EmptyState title="Couldn't reach the video service" body="Live rooms can't be listed right now." />
          ) : live.rooms.length === 0 ? (
            <EmptyState title="No classes live right now" body="A class appears here as soon as someone connects to its room." />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {live.rooms.slice(0, LIVE_ON_OVERVIEW).map((room) => (
                <LiveClassCard key={room.roomName} room={room} viewer={admin} />
              ))}
            </div>
          )}
        </Panel>

        <OverviewToday classes={today} zoneKnown={timeZone !== null} />
      </div>
    );
  });
}
