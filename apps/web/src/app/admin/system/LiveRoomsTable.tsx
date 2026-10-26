/**
 * @fileoverview The open LiveKit rooms on /admin/system, each matched to the
 * class it belongs to.
 *
 * An ORPHAN is a room LiveKit is still holding open — and billing for — with
 * no class running behind it: the session is gone, or it is no longer
 * IN_PROGRESS. Those sort first, since they are the ones to end.
 * Server component; only the End room button and the times run on the client.
 */

import Link from "next/link";
import LocalTime from "@/components/LocalTime";
import type { LiveRoom } from "@/lib/admin-ops";
import LiveEndRoomButton from "../_components/LiveEndRoomButton";
import { Badge, EmptyState, StatusBadge, table } from "../_components/ui";

export default function LiveRoomsTable({ rooms }: { rooms: LiveRoom[] }) {
  if (rooms.length === 0) {
    return <EmptyState title="No open rooms" body="LiveKit reports no rooms open for your classes right now." />;
  }
  return (
    <div className={table.wrap}>
      <table className={table.table}>
        <caption className="sr-only">Open LiveKit rooms</caption>
        <thead>
          <tr>
            <th scope="col" className={table.th}>Room</th>
            <th scope="col" className={table.th}>State</th>
            <th scope="col" className={table.th}>Class</th>
            <th scope="col" className={`${table.th} text-right`}>People</th>
            <th scope="col" className={table.th}>Opened</th>
            <th scope="col" className={table.th}><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {rooms.map((r) => (
            <tr key={r.name} className={table.tr}>
              <td className={`${table.td} font-mono text-xs break-all min-w-[10rem]`}>{r.name}</td>
              <td className={table.td}>
                {r.orphan ? <Badge tone="danger">Orphan</Badge> : <Badge tone="success">Live</Badge>}
              </td>
              <td className={table.td}>
                {r.session ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Link href={`/admin/sessions/${r.session.sessionId}`} className="font-medium hover:text-[var(--accent)] underline-offset-2 hover:underline">
                      {r.session.title || "Untitled class"}
                    </Link>
                    <StatusBadge status={r.session.status} />
                    {r.session.breakout && <Badge>Breakout</Badge>}
                  </div>
                ) : (
                  <span className="text-[var(--text-secondary)]">No matching class</span>
                )}
              </td>
              <td className={`${table.td} text-right tabular-nums`}>{r.participants}</td>
              <td className={`${table.td} whitespace-nowrap`}>
                {r.createdAt ? <LocalTime iso={r.createdAt} mode="date-time" /> : "—"}
              </td>
              <td className={`${table.td} min-w-[9rem]`}>
                <LiveEndRoomButton roomName={r.name} title={r.session?.title || r.name} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
