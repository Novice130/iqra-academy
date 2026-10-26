/**
 * @fileoverview One live room, as a card. Used by the overview and /admin/live-classes.
 *
 * There used to be two hand-copied versions of this markup, both of which
 * printed "Healthy" for every room. This shows only what lib/admin-live.ts
 * actually measured: who is connected, whether the assigned teacher is one of
 * them, how long the class has run and how far past its end it is. Every
 * signal is a text badge, never a coloured dot alone.
 *
 * Server component: the interactive pieces (join, copy, end) are their own
 * client components.
 */

import ClassActionButton from "@/components/ClassActionButton";
import CopyLinkButton from "@/components/CopyLinkButton";
import LocalTime from "@/components/LocalTime";
import type { LiveRoom } from "@/lib/admin-live";
import type { AdminContext } from "@/lib/admin-page";
import { Badge, StatusBadge, humanize } from "./ui";
import LiveEndRoomButton from "./LiveEndRoomButton";

function TeacherBadge({ connected }: { connected: boolean | null }) {
  if (connected === true) return <Badge tone="success">Teacher connected</Badge>;
  if (connected === false) return <Badge tone="danger">Teacher not connected</Badge>;
  return <Badge>Teacher status unknown</Badge>;
}

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 text-xs">
      <dt className="w-20 shrink-0 text-[var(--text-tertiary)]">{term}</dt>
      <dd className="min-w-0 flex-1 text-[var(--text-primary)] break-words">{children}</dd>
    </div>
  );
}

export default function LiveClassCard({
  room,
  viewer,
  detailed = false,
}: {
  room: LiveRoom;
  viewer: Pick<AdminContext, "userId" | "orgId" | "role">;
  /** The full live page: teacher email, who is in the room, room name, End room. */
  detailed?: boolean;
}) {
  const students = room.students.length ? room.students.join(", ") : "No students booked";

  return (
    <article className="flex flex-col justify-between gap-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 sm:p-5">
      <div className="space-y-3">
        <div className="space-y-2">
          <h3 className="text-sm font-semibold leading-snug text-[var(--text-primary)] break-words">{room.title}</h3>
          <div className="flex flex-wrap gap-1.5">
            <TeacherBadge connected={room.teacherConnected} />
            {room.overrunMinutes > 0 && <Badge tone="warning">{room.overrunMinutes} min over</Badge>}
            {room.status !== "IN_PROGRESS" && <StatusBadge status={room.status} />}
            {room.track && <Badge>{humanize(room.track)}</Badge>}
          </div>
        </div>

        <dl className="space-y-1.5">
          <Row term="Teacher">
            {room.teacherName}
            {detailed && room.teacherEmail !== room.teacherName && (
              <span className="block text-[var(--text-secondary)]">{room.teacherEmail}</span>
            )}
          </Row>
          <Row term="Students">{students}</Row>
          <Row term="In room">
            {room.participantCount} connected
            {detailed && room.participantNames.length > 0 && (
              <span className="block text-[var(--text-secondary)]">{room.participantNames.join(", ")}</span>
            )}
          </Row>
          <Row term="Started">
            {room.startedAt ? <LocalTime iso={room.startedAt} mode="time" /> : "Unknown"}
            {room.elapsedMinutes !== null && <span className="text-[var(--text-secondary)]"> · {room.elapsedMinutes} min ago</span>}
          </Row>
          <Row term="Ends">
            <LocalTime iso={room.scheduledEnd} mode="time" />
            <span className="text-[var(--text-secondary)]"> scheduled</span>
          </Row>
          {room.breakoutRoomNames.length > 0 && (
            <Row term="Breakouts">{room.breakoutRoomNames.length} open</Row>
          )}
          {detailed && (
            <Row term="Room">
              <code className="font-mono text-[11px] break-all">{room.roomName}</code>
            </Row>
          )}
        </dl>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
        <ClassActionButton
          session={{
            id: room.sessionId,
            status: room.status,
            actualStart: room.startedAt,
            scheduledStart: room.scheduledStart,
            scheduledEnd: room.scheduledEnd,
            teacherId: room.teacherId,
            title: room.title,
          }}
          viewer={{ userId: viewer.userId, orgId: viewer.orgId, role: viewer.role, isAdmin: true }}
          variant="compact"
        />
        <CopyLinkButton path={`/dashboard/session/${room.sessionId}`} />
        {detailed && (
          <LiveEndRoomButton
            roomNames={[...room.breakoutRoomNames.filter((n) => n !== room.roomName), room.roomName]}
            title={room.title}
          />
        )}
      </div>
    </article>
  );
}
