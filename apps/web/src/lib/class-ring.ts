/**
 * @fileoverview Ringing a whole class when the teacher opens it.
 *
 * The pieces already existed — `call_invites`, the student's
 * `IncomingCallOverlay`, the FCM and web-push senders — but every one of them
 * was driven by the teacher picking a student by hand. In a real lesson the
 * teacher arrives and then has to chase each student individually, or hope
 * they are watching their dashboard for a "class started" banner. This rings
 * all of them at once, the moment the teacher actually connects.
 *
 * Three things it must not do, all of which are why this isn't a one-line
 * insert:
 *
 *  1. **Ring people who are already in the room.** Somebody who arrived early
 *     would sit in the class watching their own phone ring.
 *  2. **Ring again every time the teacher reconnects.** Teachers now survive a
 *     dropped connection and rejoin (see LiveKitRoom's `endOnDisconnectRef`),
 *     and every one of those reconnections comes back through the join route.
 *     Hence the cooldown.
 *  3. **Break the join if any of it fails.** Callers treat this as
 *     best-effort — a push service being down is not a reason a teacher can't
 *     get into their own class.
 *
 * The roster is read across *every* session row of the occurrence, not just
 * the canonical one. A class here is a group row plus one INDIVIDUAL row per
 * student, and each student's booking normally sits on their own row — read
 * the canonical row alone and a class of three rings nobody. Same rule the
 * room resolver and the attendance report use.
 */

import { and, eq, gt, gte, inArray, lte, ne } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { db, withHttpDb } from "@/lib/db";
import { bookings, callInvites, sessions, users } from "@/db/schema";
import { SIBLING_WINDOW_MS } from "@/lib/class-room";
import { baseIdentity, getRoomServiceClient } from "@/lib/livekit";
import { sendCallPush } from "@/lib/fcm";
import { sendWebPushToUsers } from "@/lib/webpush";

/**
 * How long after ringing a student we refuse to ring them again for the same
 * class.
 *
 * Sized against the rejoin window: a teacher whose phone died has ten minutes
 * to get back into the room, and each attempt runs through here. Without this,
 * a bad connection at the teacher's end means a student's phone rings over and
 * over while they are trying to attend the lesson.
 */
const RE_RING_COOLDOWN_MS = 10 * 60 * 1000;

/**
 * Everyone booked into one class occurrence, minus the teacher.
 *
 * Two things make this more than a `where sessionId = ?`. A class here is a
 * group row plus one INDIVIDUAL row per student, and each student's booking
 * normally sits on their own row — read the canonical row alone and a class of
 * three returns nobody. And the roster is keyed on `userId`, not on the student
 * profile: a notification reaches a *person's* devices, and the profile is only
 * how the booking happens to be filed.
 *
 * `includeFinished` is the difference between the two callers. Ringing must
 * skip rows already cancelled or completed — nobody wants a phone ringing for a
 * lesson that is over. The class-*ended* push is the opposite case: by the time
 * it is sent the row has just been marked COMPLETED, and excluding it would
 * mean the message never reaches the students it is about.
 */
export async function classRosterUserIds(opts: {
  canonical: { teacherId: string; scheduledStart: Date | null };
  teacherId: string;
  includeFinished?: boolean;
}): Promise<string[]> {
  return withHttpDb(async () => {
    const { canonical, teacherId, includeFinished = false } = opts;

    // Same ±90min rule the room resolver groups occurrences on.
    const anchor = canonical.scheduledStart?.getTime() ?? Date.now();
    const statusFilters = includeFinished
      ? [ne(sessions.status, "CANCELLED")]
      : [ne(sessions.status, "CANCELLED"), ne(sessions.status, "COMPLETED")];

    const rows = await db.query.sessions.findMany({
      where: and(
        eq(sessions.teacherId, canonical.teacherId),
        ...statusFilters,
        gte(sessions.scheduledStart, new Date(anchor - SIBLING_WINDOW_MS)),
        lte(sessions.scheduledStart, new Date(anchor + SIBLING_WINDOW_MS))
      ),
      columns: { id: true },
    });
    const sessionIds = rows.map((r) => r.id);
    if (sessionIds.length === 0) return [];

    const roster = await db.query.bookings.findMany({
      where: and(inArray(bookings.sessionId, sessionIds), ne(bookings.status, "CANCELLED")),
      columns: { userId: true },
    });
    return [...new Set(roster.map((b) => b.userId))].filter((id) => id !== teacherId);
  });
}

/**
 * Ring every booked student who isn't already in the room.
 *
 * `canonical` is the occurrence's canonical session row — the one
 * `resolveClassRoom` returned. Invites are written against its id so a
 * student's Accept lands them in the room the teacher is actually in.
 *
 * Returns how many students were rung. Zero is a perfectly normal answer:
 * everyone already present, everyone rung a minute ago, or a class with no
 * bookings on it.
 */
export async function ringClassStudents(opts: {
  canonical: { id: string; orgId: string; teacherId: string; scheduledStart: Date | null };
  roomName: string;
  teacherId: string;
  teacherName: string;
}): Promise<number> {
  return withHttpDb(async () => {
    const { canonical, roomName, teacherId, teacherName } = opts;

    // 1 & 2. Who is expected in this class, across every row of the occurrence.
    let candidates = await classRosterUserIds({ canonical, teacherId });
    if (candidates.length === 0) return 0;

    // 3. Drop anyone already in the room. Identity is `email#random` per
    //    connection, so presence is matched on the base identity, which is the
    //    email — hence loading the users rather than comparing ids.
    try {
      const participants = await getRoomServiceClient().listParticipants(roomName);
      const present = new Set(
        participants
          .map((p) => baseIdentity(p.identity))
          .filter((e): e is string => !!e)
      );
      if (present.size > 0) {
        const people = await db.query.users.findMany({
          where: inArray(users.id, candidates),
          columns: { id: true, email: true },
        });
        const inRoom = new Set(
          people.filter((u) => u.email && present.has(u.email)).map((u) => u.id)
        );
        candidates = candidates.filter((id) => !inRoom.has(id));
      }
    } catch {
      // Couldn't tell who is in the room — ring everyone rather than nobody. A
      // duplicate ring for someone already present is a nuisance; ringing no one
      // when the teacher arrives is the bug this whole file exists to fix.
    }
    if (candidates.length === 0) return 0;

    // 4. Rung recently for this same class — the teacher reconnecting, most
    //    likely. See RE_RING_COOLDOWN_MS.
    const recent = await db.query.callInvites.findMany({
      where: and(
        eq(callInvites.sessionId, canonical.id),
        inArray(callInvites.calleeId, candidates),
        gt(callInvites.createdAt, new Date(Date.now() - RE_RING_COOLDOWN_MS))
      ),
      columns: { calleeId: true },
    });
    const cooling = new Set(recent.map((r) => r.calleeId));
    candidates = candidates.filter((id) => !cooling.has(id));
    if (candidates.length === 0) return 0;

    // 5. One invite per student: the callId is what an Accept resolves against,
    //    so a shared row would let the first student's answer stop everyone
    //    else's ring.
    const invites = candidates.map((calleeId) => ({
      id: createId(),
      orgId: canonical.orgId,
      sessionId: canonical.id,
      callerId: teacherId,
      calleeId,
      status: "RINGING" as const,
    }));
    await db.insert(callInvites).values(invites);

    // Rings the phone itself for anyone with the app installed; a no-op
    // otherwise. Sent per student because the payload carries their own callId.
    await Promise.all(
      invites.map((i) =>
        sendCallPush([i.calleeId], {
          callId: i.id,
          sessionId: canonical.id,
          callerName: teacherName,
        }).catch(() => {})
      )
    );
    // ...and a closed laptop tab. One call, the sender fans out.
    await sendWebPushToUsers(candidates).catch(() => {});

    return invites.length;
  });
}
