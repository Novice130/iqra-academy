/**
 * @fileoverview /admin/sessions/[id] — one class: what it is, who was in it,
 * what happened to it, and the actions to change it.
 *
 * Out-of-org ids 404 rather than 403, so an ORG_ADMIN cannot probe for
 * another school's classes.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, gt, inArray, isNull, lt, ne, or } from "drizzle-orm";
import { db, withHttpDb } from "@/lib/db";
import { auditLogs, sessions, users } from "@/db/schema";
import { orgFilter, requireAdminPage } from "@/lib/admin-page";
import { getAttendanceReport } from "@/lib/attendance";
import { SIBLING_WINDOW_MS } from "@/lib/class-room";
import { generateRoomName } from "@/lib/livekit";
import LocalTime from "@/components/LocalTime";
import ClassActionButton from "@/components/ClassActionButton";
import CopyLinkButton from "@/components/CopyLinkButton";
import { Badge, DefinitionList, EmptyState, PageHeader, Panel, StatusBadge, humanize } from "@/app/admin/_components/ui";
import SessionActions from "./SessionActions";
import AttendancePanel from "./AttendancePanel";
import HistoryPanel, { type HistoryEntry } from "./HistoryPanel";
import RecordingAccess from "./RecordingAccess";

export const dynamic = "force-dynamic";

const linkCls = "font-medium text-[var(--accent)] hover:underline";

function minutesBetween(a: Date | null, b: Date | null): string | null {
  if (!a || !b) return null;
  return `${Math.round((b.getTime() - a.getTime()) / 60000)} min`;
}

export default async function AdminSessionPage({ params }: { params: Promise<{ id: string }> }) {
  return withHttpDb(async () => {
    const { id } = await params;
    const admin = await requireAdminPage(`/admin/sessions/${id}`);

    const session = await db.query.sessions.findFirst({
      where: and(eq(sessions.id, id), orgFilter(admin, sessions.orgId)),
      with: {
        teacher: { columns: { id: true, name: true, email: true } },
        bookings: {
          columns: { id: true, status: true, userId: true },
          with: {
            studentProfile: { columns: { id: true, name: true, track: true } },
            user: { columns: { id: true, name: true, email: true } },
          },
        },
      },
    });
    if (!session) notFound();

    const start = new Date(session.scheduledStart);
    const end = new Date(session.scheduledEnd);
    const actualStart = session.actualStart ? new Date(session.actualStart) : null;
    const actualEnd = session.actualEnd ? new Date(session.actualEnd) : null;

    const [teacherRows, historyRows, occurrences, siblingRows] = await Promise.all([
      db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(
          and(
            eq(users.orgId, session.orgId),
            inArray(users.role, ["TEACHER", "ORG_ADMIN", "SUPER_ADMIN"]),
            isNull(users.deletedAt)
          )
        )
        .orderBy(users.name),
      db
        .select({
          id: auditLogs.id,
          action: auditLogs.action,
          metadata: auditLogs.metadata,
          createdAt: auditLogs.createdAt,
          actorName: users.name,
          actorEmail: users.email,
        })
        .from(auditLogs)
        .leftJoin(users, eq(auditLogs.actorId, users.id))
        .where(
          and(
            or(eq(auditLogs.target, `session:${id}`), eq(auditLogs.target, id)),
            orgFilter(admin, auditLogs.orgId)
          )
        )
        .orderBy(desc(auditLogs.createdAt))
        .limit(50),
      // The window reaches back two sibling windows so that a row opening an
      // occurrence just before this one is still read and grouped with it.
      getAttendanceReport({
        orgId: session.orgId,
        teacherId: session.teacherId,
        from: new Date(start.getTime() - 2 * SIBLING_WINDOW_MS),
        to: new Date(start.getTime() + SIBLING_WINDOW_MS),
      }),
      db
        .select({ id: sessions.id })
        .from(sessions)
        .where(
          and(
            eq(sessions.teacherId, session.teacherId),
            eq(sessions.orgId, session.orgId),
            ne(sessions.id, session.id),
            isNull(sessions.mergedIntoId),
            ne(sessions.status, "CANCELLED"),
            lt(sessions.scheduledStart, end),
            gt(sessions.scheduledEnd, start)
          )
        )
        .orderBy(sessions.scheduledStart),
    ]);

    const occurrence = occurrences.find((o) => o.sessionIds.includes(id)) ?? null;
    // The same rule lib/admin-scheduling.ts uses to decide what a class-wide
    // action reaches: this teacher's live rows overlapping this one in time.
    const siblingIds = siblingRows.map((r) => r.id);
    const hasStarted = start.getTime() <= Date.now();

    const activeBookings = session.bookings.filter((b) => b.status !== "CANCELLED");
    const history: HistoryEntry[] = historyRows.map((h) => ({
      id: h.id,
      action: h.action,
      actorName: h.actorName ?? h.actorEmail ?? null,
      createdAt: new Date(h.createdAt).toISOString(),
      metadata: (h.metadata as Record<string, unknown> | null) ?? {},
    }));

    const title = session.title || "Class";
    const teacherName = session.teacher?.name || session.teacher?.email || "Teacher";

    return (
      <div className="space-y-6">
        <PageHeader
          crumbs={[
            { label: "Admin", href: "/admin" },
            { label: "Scheduled classes", href: "/admin/scheduled-classes" },
            { label: title },
          ]}
          title={title}
          description={
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <StatusBadge status={session.status} />
              {session.isTrial && <Badge tone="info">Trial</Badge>}
              <span>
                <LocalTime iso={start.toISOString()} mode="full-date" />, <LocalTime iso={start.toISOString()} mode="time" />
                {" – "}
                <LocalTime iso={end.toISOString()} mode="time" withZone />
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Teacher{" "}
                <Link href={`/admin/teachers/${session.teacherId}`} className={linkCls}>
                  {teacherName}
                </Link>
              </span>
            </span>
          }
          actions={
            <>
              <ClassActionButton
                session={{ id: session.id, scheduledStart: start.toISOString(), scheduledEnd: end.toISOString(), status: session.status, title }}
                viewer={{ role: "ORG_ADMIN", isAdmin: true }}
                variant="compact"
              />
              <CopyLinkButton path={`/dashboard/session/${session.id}`} />
            </>
          }
        />

        {session.mergedIntoId && (
          <p role="note" className="rounded-xl border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 p-3 text-sm">
            This class was combined into{" "}
            <Link href={`/admin/sessions/${session.mergedIntoId}`} className={linkCls}>
              another class
            </Link>
            . Its students now attend that one.
          </p>
        )}

        <Panel
          title="Actions"
          description={
            siblingIds.length > 0
              ? "Cancel, reschedule, reassign and completed apply to every row of this teacher's that overlaps this class in time; a no-show applies to this row only. Families and teachers are notified of cancellations, new times and new teachers."
              : "Families and teachers are notified of cancellations, new times and new teachers. A no-show applies to this row only."
          }
        >
          <SessionActions
            sessionId={session.id}
            status={session.status}
            scheduledStart={start.toISOString()}
            durationMinutes={Math.round((end.getTime() - start.getTime()) / 60000)}
            teacherId={session.teacherId}
            teachers={teacherRows.map((t) => ({ id: t.id, name: t.name || t.email }))}
            hasStarted={hasStarted}
          />
        </Panel>

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Details">
            <DefinitionList
              items={[
                { term: "Type", value: humanize(session.type) },
                { term: "Track", value: session.track ? humanize(session.track) : null },
                { term: "Origin", value: humanize(session.origin) },
                { term: "Join code", value: session.joinCode ? <span className="font-mono">{session.joinCode}</span> : null },
                { term: "Room name", value: <span className="font-mono text-xs">{session.videoRoomName || `${generateRoomName(session.id)} (default)`}</span> },
                { term: "Counts against quota", value: session.consumesQuota ? "Yes" : "No" },
                { term: "Scheduled start", value: <LocalTime iso={start.toISOString()} mode="date-time" withZone /> },
                { term: "Scheduled end", value: <LocalTime iso={end.toISOString()} mode="date-time" withZone /> },
                { term: "Actual start", value: actualStart ? <LocalTime iso={actualStart.toISOString()} mode="date-time" withZone /> : "Not started" },
                { term: "Actual end", value: actualEnd ? <LocalTime iso={actualEnd.toISOString()} mode="date-time" withZone /> : "—" },
                { term: "Scheduled length", value: minutesBetween(start, end) },
                { term: "Actual length", value: minutesBetween(actualStart, actualEnd) ?? "—" },
              ]}
            />
          </Panel>

          <Panel title="Students" description={`${activeBookings.length} booked`}>
            {session.bookings.length === 0 ? (
              <EmptyState title="No students booked" body="Nobody has a booking on this class row." />
            ) : (
              <ul className="space-y-2">
                {session.bookings.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>
                      {b.studentProfile ? (
                        <Link href={`/admin/students/${b.studentProfile.id}`} className={linkCls}>
                          {b.studentProfile.name}
                        </Link>
                      ) : (
                        <span>{b.user?.name || "Student"}</span>
                      )}
                      <span className="ml-2 text-xs text-[var(--text-tertiary)]">{b.user?.email}</span>
                    </span>
                    <StatusBadge status={b.status} />
                  </li>
                ))}
              </ul>
            )}
            {siblingIds.length > 0 && (
              <p className="mt-4 text-xs text-[var(--text-secondary)]">
                This class runs alongside {siblingIds.length} other {siblingIds.length === 1 ? "row" : "rows"} of the same teacher at the same time:{" "}
                {siblingIds.map((s, i) => (
                  <span key={s}>
                    {i > 0 && ", "}
                    <Link href={`/admin/sessions/${s}`} className={linkCls}>
                      row {i + 1}
                    </Link>
                  </span>
                ))}
                . Cancel, reschedule, reassign and marking the class completed apply to every row at the same time as this one; a no-show applies to this row only.
              </p>
            )}
          </Panel>
        </div>

        <AttendancePanel occurrence={occurrence} hasStarted={hasStarted} />

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Recording">
            {session.recordingUrl ? (
              <div className="space-y-4">
                <a href={session.recordingUrl} target="_blank" rel="noopener noreferrer" className={linkCls}>
                  Open recording<span className="sr-only"> (opens in a new tab)</span>
                </a>
                <RecordingAccess sessionId={session.id} access={session.recordingAccess} />
              </div>
            ) : (
              <EmptyState title="No recording" body="This class was not recorded, or the recording has not been attached yet." />
            )}
          </Panel>
          <HistoryPanel entries={history} />
        </div>
      </div>
    );
  });
}
