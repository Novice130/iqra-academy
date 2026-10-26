/**
 * @fileoverview "Today" on the admin overview — the classes still to come today.
 *
 * "Today" is the viewer's day (lib/admin-metrics.ts works out the bounds on the
 * server); the times themselves are rendered by LocalTime in the browser.
 */

import Link from "next/link";
import LocalTime from "@/components/LocalTime";
import type { OverviewClass } from "@/lib/admin-metrics";
import { Badge, EmptyState, Panel, StatusBadge, table } from "./ui";

const LIMIT = 15;

export default function OverviewToday({ classes, zoneKnown }: { classes: OverviewClass[]; zoneKnown: boolean }) {
  const shown = classes.slice(0, LIMIT);
  const viewAll = (
    <Link href="/admin/scheduled-classes" className="text-xs font-semibold text-[var(--accent)] hover:underline">
      All classes
    </Link>
  );

  return (
    <Panel
      title="Today"
      description={
        zoneKnown
          ? "Classes still to come or in progress today."
          : "Classes still to come or in progress today. Your time zone isn't set, so the day is counted in UTC; set it in Settings."
      }
      actions={viewAll}
      flush
    >
      {shown.length === 0 ? (
        <EmptyState title="No more classes today" body="Everything scheduled for today has finished, or nothing was booked." />
      ) : (
        <div className={table.wrap}>
          <table className={table.table}>
            <thead>
              <tr>
                <th scope="col" className={table.th}>Time</th>
                <th scope="col" className={table.th}>Class</th>
                <th scope="col" className={table.th}>Teacher</th>
                <th scope="col" className={table.th}>Students</th>
                <th scope="col" className={table.th}>Status</th>
                <th scope="col" className={table.th}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.sessionId} className={table.tr}>
                  <td className={`${table.td} whitespace-nowrap tabular-nums`}>
                    <LocalTime iso={c.scheduledStart} mode="time" />–<LocalTime iso={c.endsAt} mode="time" />
                  </td>
                  <td className={table.td}>
                    <span className="font-medium">{c.title}</span>
                    {c.isTrial && (
                      <span className="ml-2">
                        <Badge tone="info">Trial</Badge>
                      </span>
                    )}
                  </td>
                  <td className={`${table.td} whitespace-nowrap`}>{c.teacherName}</td>
                  <td className={`${table.td} min-w-[10rem] text-[var(--text-secondary)]`}>
                    {c.students.length ? c.students.join(", ") : "No students booked"}
                  </td>
                  <td className={table.td}>
                    <StatusBadge status={c.status} />
                  </td>
                  <td className={`${table.td} text-right`}>
                    <Link
                      href={`/admin/sessions/${c.sessionId}`}
                      className="text-xs font-semibold text-[var(--accent)] hover:underline whitespace-nowrap"
                      aria-label={`Open ${c.title}`}
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {classes.length > LIMIT && (
            <p className="px-4 py-3 text-xs text-[var(--text-secondary)] sm:px-5">
              Showing {LIMIT} of {classes.length}. <Link href="/admin/scheduled-classes" className="font-semibold text-[var(--accent)] hover:underline">See all classes</Link>
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}
