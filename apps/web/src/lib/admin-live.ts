/**
 * @fileoverview The one loader for "what is live right now" in the admin panel.
 *
 * The overview and /admin/live-classes used to carry two near-identical copies
 * of this, both of which labelled every room "Healthy" and silently dropped a
 * room whose teacher had no open attendance row — which is exactly the room an
 * admin most needs to see. This version keeps every matched room and reports
 * only signals we actually have:
 *
 *   - who is connected, from LiveKit's own participant list (the attendance
 *     table is the fallback, because a lost `participant_left` webhook leaves a
 *     row open and would claim a teacher is there when they are not);
 *   - whether the assigned teacher is among them;
 *   - minutes since the class started, and minutes past its scheduled end.
 *
 * A class in breakouts is still one class: its breakout rooms are folded into
 * the parent session's card (participants summed, teacher found in any of
 * them), never listed as rooms without a class.
 *
 * LiveKit is the source of truth for "open": a room can be open while its
 * session row already says COMPLETED, and that room is still being billed. So
 * the session's DB status is returned as-is rather than assumed IN_PROGRESS.
 *
 * Students come from bookings across the whole occurrence, not just the room's
 * own row — a group class is a group row plus one INDIVIDUAL row per student
 * (see lib/class-room.ts), and the bookings sit on those.
 *
 * Every instant leaves as an ISO string so client components can render it in
 * the viewer's zone.
 *
 * @module lib/admin-live
 */

import { and, gte, inArray, isNull, lte, ne, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, sessionAttendance, sessions, studentProfiles, users } from "@/db/schema";
import { baseIdentity, getRoomServiceClient, isScreenShareIdentity } from "@/lib/livekit";
import { resolveRoomSessions, roomVisibleTo } from "@/lib/admin-ops";
import { SIBLING_WINDOW_MS } from "@/lib/meeting-constants";
import { orgFilter, type AdminContext } from "@/lib/admin-page";

export interface LiveRoom {
  sessionId: string;
  /** The class's main room, or its first breakout when the main room is empty. */
  roomName: string;
  /** Breakout rooms of this class that have people in them. */
  breakoutRoomNames: string[];
  title: string;
  track: string | null;
  /** The session row's status. Usually IN_PROGRESS; anything else is itself a signal. */
  status: string;
  teacherId: string;
  teacherName: string;
  teacherEmail: string;
  students: string[];
  /** People connected across the main room and its breakouts, screen-share publishers excluded. */
  participantCount: number;
  participantNames: string[];
  /** Null when neither LiveKit nor attendance could tell us. */
  teacherConnected: boolean | null;
  /** ISO. The session's actual start, else when LiveKit opened the room. */
  startedAt: string | null;
  scheduledStart: string;
  scheduledEnd: string;
  elapsedMinutes: number | null;
  /** Minutes past the scheduled end (which already includes extensions). 0 when not over. */
  overrunMinutes: number;
}

/** An open room with no session we can match — only shown to SUPER_ADMIN, since its org is unknown. */
export interface UnmatchedRoom {
  roomName: string;
  participantCount: number;
}

export interface LiveSnapshot {
  rooms: LiveRoom[];
  unmatched: UnmatchedRoom[];
  /** True when LiveKit could not be reached: "no rooms" would then be a guess. */
  unavailable: boolean;
}

const MINUTE = 60_000;

type OpenRoom = Awaited<ReturnType<ReturnType<typeof getRoomServiceClient>["listRooms"]>>[number];

function minutesSince(from: Date | null, now: number): number | null {
  if (!from) return null;
  return Math.max(0, Math.floor((now - from.getTime()) / MINUTE));
}

/** Every room open on LiveKit that belongs to the admin's scope, with its real signals. */
export async function getLiveRooms(ctx: AdminContext): Promise<LiveSnapshot> {
  let svc: ReturnType<typeof getRoomServiceClient>;
  let allRooms: OpenRoom[];
  try {
    svc = getRoomServiceClient();
    allRooms = await svc.listRooms();
  } catch (error) {
    console.error("[admin-live] listRooms failed", error);
    return { rooms: [], unmatched: [], unavailable: true };
  }

  const open = allRooms.filter((r) => r.numParticipants > 0);
  if (open.length === 0) return { rooms: [], unmatched: [], unavailable: false };

  // One lookup for main and breakout rooms alike (lib/admin-ops.ts, the same
  // resolver the livekit-rooms route scopes by). A breakout belongs to its
  // parent class: without this a class vanished from "Live now" the moment
  // its students went into breakouts.
  const matches = await resolveRoomSessions(open.map((r) => r.name));
  const visible = open.filter((r) => roomVisibleTo(ctx, matches.get(r.name)));

  // roomVisibleTo only lets a SUPER_ADMIN see a room with no session.
  const unmatched: UnmatchedRoom[] = visible
    .filter((r) => !matches.has(r.name))
    .map((r) => ({ roomName: r.name, participantCount: r.numParticipants }));

  const groups = new Map<string, { main: OpenRoom | null; breakouts: OpenRoom[] }>();
  for (const room of visible) {
    const match = matches.get(room.name);
    if (!match) continue;
    const g = groups.get(match.sessionId) ?? { main: null, breakouts: [] };
    if (match.breakout) g.breakouts.push(room);
    else g.main = room;
    groups.set(match.sessionId, g);
  }
  if (groups.size === 0) return { rooms: [], unmatched, unavailable: false };

  const matched = await db
    .select({
      id: sessions.id,
      teacherId: sessions.teacherId,
      status: sessions.status,
      title: sessions.title,
      track: sessions.track,
      scheduledStart: sessions.scheduledStart,
      scheduledEnd: sessions.scheduledEnd,
      actualStart: sessions.actualStart,
      teacherName: users.name,
      teacherEmail: users.email,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.teacherId, users.id))
    .where(and(orgFilter(ctx, sessions.orgId), inArray(sessions.id, [...groups.keys()])));

  const pairs = matched.map((session) => {
    const g = groups.get(session.id)!;
    return { session, rooms: [...(g.main ? [g.main] : []), ...g.breakouts], main: g.main };
  });
  if (pairs.length === 0) return { rooms: [], unmatched, unavailable: false };

  const sessionIds = pairs.map((p) => p.session.id);
  const teacherIds = [...new Set(pairs.map((p) => p.session.teacherId))];
  const starts = pairs.map((p) => p.session.scheduledStart.getTime());
  const windowFrom = new Date(Math.min(...starts) - SIBLING_WINDOW_MS);
  const windowTo = new Date(Math.max(...starts) + SIBLING_WINDOW_MS);

  const [participantLists, openTeacherRows, rosterRows] = await Promise.all([
    // One call per room, breakouts included. A failure for one room degrades
    // that card to the attendance fallback instead of blanking the page.
    Promise.all(pairs.map((p) => Promise.all(p.rooms.map((r) => svc.listParticipants(r.name).catch(() => null))))),
    db
      .select({ sessionId: sessionAttendance.sessionId, userId: sessionAttendance.userId })
      .from(sessionAttendance)
      .where(
        and(
          inArray(sessionAttendance.sessionId, sessionIds),
          eq(sessionAttendance.role, "TEACHER"),
          isNull(sessionAttendance.leftAt)
        )
      ),
    db
      .select({
        teacherId: sessions.teacherId,
        scheduledStart: sessions.scheduledStart,
        profileName: studentProfiles.name,
        userName: users.name,
      })
      .from(bookings)
      .innerJoin(sessions, eq(bookings.sessionId, sessions.id))
      .innerJoin(users, eq(bookings.userId, users.id))
      .leftJoin(studentProfiles, eq(bookings.studentProfileId, studentProfiles.id))
      .where(
        and(
          orgFilter(ctx, sessions.orgId),
          inArray(sessions.teacherId, teacherIds),
          gte(sessions.scheduledStart, windowFrom),
          lte(sessions.scheduledStart, windowTo),
          isNull(sessions.mergedIntoId),
          ne(bookings.status, "CANCELLED")
        )
      ),
  ]);

  const teacherOpen = new Set(openTeacherRows.map((r) => `${r.sessionId}:${r.userId}`));
  const now = Date.now();

  const rooms = pairs.map(({ session, rooms: classRooms, main }, i): LiveRoom => {
    const lists = participantLists[i];
    const people = lists.flatMap((l) => l ?? []).filter((p) => !isScreenShareIdentity(p.identity));
    const allListed = lists.every((l) => l !== null);
    const teacherEmail = session.teacherEmail.toLowerCase();

    const seenTeacher = people.some((p) => baseIdentity(p.identity).toLowerCase() === teacherEmail);
    const teacherConnected =
      seenTeacher || allListed ? seenTeacher : teacherOpen.has(`${session.id}:${session.teacherId}`);

    // Rooms whose participant list failed still count, by LiveKit's own total.
    const unlistedCount = classRooms.reduce((n, r, j) => n + (lists[j] === null ? r.numParticipants : 0), 0);

    const start = session.scheduledStart.getTime();
    const students = [
      ...new Set(
        rosterRows
          .filter((r) => r.teacherId === session.teacherId && Math.abs(r.scheduledStart.getTime() - start) <= SIBLING_WINDOW_MS)
          .map((r) => r.profileName || r.userName || "Student")
      ),
    ].sort((a, b) => a.localeCompare(b));

    const opener = main ?? classRooms[0];
    const roomOpened = opener.creationTime ? new Date(Number(opener.creationTime) * 1000) : null;
    const startedAt = session.actualStart ?? roomOpened;
    // scheduledEnd already includes extensions: the extend route moves it.
    const endMs = session.scheduledEnd.getTime();

    return {
      sessionId: session.id,
      roomName: opener.name,
      breakoutRoomNames: classRooms.filter((r) => r !== main).map((r) => r.name),
      title: session.title || "Class",
      track: session.track,
      status: session.status,
      teacherId: session.teacherId,
      teacherName: session.teacherName || session.teacherEmail,
      teacherEmail: session.teacherEmail,
      students,
      participantCount: people.length + unlistedCount,
      participantNames: people.map((p) => p.name || baseIdentity(p.identity)),
      teacherConnected,
      startedAt: startedAt ? startedAt.toISOString() : null,
      scheduledStart: session.scheduledStart.toISOString(),
      scheduledEnd: session.scheduledEnd.toISOString(),
      elapsedMinutes: minutesSince(startedAt, now),
      overrunMinutes: Math.max(0, Math.floor((now - endMs) / MINUTE)),
    };
  });

  // Rooms that need a look first: teacher missing, then running over, then oldest.
  rooms.sort(
    (a, b) =>
      Number(a.teacherConnected !== false) - Number(b.teacherConnected !== false) ||
      b.overrunMinutes - a.overrunMinutes ||
      (b.elapsedMinutes ?? 0) - (a.elapsedMinutes ?? 0)
  );

  return { rooms, unmatched, unavailable: false };
}
