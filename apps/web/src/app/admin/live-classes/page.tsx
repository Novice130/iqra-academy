/**
 * @fileoverview /admin/live-classes — every room open on LiveKit right now.
 *
 * Built on lib/admin-live.ts, the same loader as the overview's "Live now"
 * panel. A room whose teacher is not connected is shown and sorted first
 * rather than hidden, because it is the one an admin most needs to act on.
 * When LiveKit can't be reached the page says so instead of claiming nothing
 * is live.
 */

import Link from "next/link";
import { withHttpDb } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin-page";
import { getLiveRooms } from "@/lib/admin-live";
import { EmptyState, PageHeader, Panel, btn } from "../_components/ui";
import LiveClassCard from "../_components/LiveClassCard";
import LiveAutoRefresh from "../_components/LiveAutoRefresh";
import LiveEndRoomButton from "../_components/LiveEndRoomButton";

export const dynamic = "force-dynamic";

export default async function AdminLiveClassesPage() {
  return withHttpDb(async () => {
    const admin = await requireAdminPage("/admin/live-classes");
    const { rooms, unmatched, unavailable } = await getLiveRooms(admin);
    const missingTeacher = rooms.filter((r) => r.teacherConnected === false).length;

    return (
      <div className="space-y-6">
        <PageHeader
          title="Live now"
          crumbs={[{ label: "Admin", href: "/admin" }, { label: "Live now" }]}
          description={
            unavailable
              ? "The video service could not be reached."
              : `${rooms.length} ${rooms.length === 1 ? "class" : "classes"} in progress${
                  missingTeacher ? `, ${missingTeacher} without the teacher connected` : ""
                }.`
          }
          actions={
            <>
              <LiveAutoRefresh />
              <Link href="/admin/scheduled-classes" className={btn.secondary}>
                Classes
              </Link>
            </>
          }
        />

        {unavailable ? (
          <Panel>
            <div role="alert">
              <EmptyState
                title="Couldn't reach the video service"
                body="Live rooms can't be listed right now, so this page can't tell whether any class is running. It retries every 30 seconds. System health has the details."
                action={
                  <Link href="/admin/system" className={btn.secondary}>
                    System health
                  </Link>
                }
              />
            </div>
          </Panel>
        ) : rooms.length === 0 ? (
          <Panel>
            <EmptyState
              title="No classes live right now"
              body="A class appears here as soon as someone connects to its room."
              action={
                <Link href="/admin/scheduled-classes" className={btn.secondary}>
                  See scheduled classes
                </Link>
              }
            />
          </Panel>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rooms.map((room) => (
              <LiveClassCard key={room.roomName} room={room} viewer={admin} detailed />
            ))}
          </div>
        )}

        {unmatched.length > 0 && (
          <Panel
            title="Rooms without a class"
            description="Open on the video service with people connected, but no session matches the room name. They are still billed."
            flush
          >
            <ul className="divide-y divide-[var(--border)]">
              {unmatched.map((r) => (
                <li key={r.roomName} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
                  <div className="min-w-0 text-sm">
                    <code className="font-mono text-xs break-all text-[var(--text-primary)]">{r.roomName}</code>
                    <div className="text-xs text-[var(--text-secondary)]">{r.participantCount} connected</div>
                  </div>
                  <LiveEndRoomButton roomNames={[r.roomName]} title={r.roomName} />
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
    );
  });
}
