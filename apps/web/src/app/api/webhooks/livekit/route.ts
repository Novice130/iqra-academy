/**
 * @fileoverview LiveKit Webhook Handler — the authoritative attendance record.
 *
 * The join API opens an attendance row and a `sendBeacon` from the call page
 * closes it. That covers somebody clicking Leave. It does not cover the phone
 * that ran out of battery, the WebView the OS killed to reclaim memory, or the
 * network that vanished mid-lesson — and those are exactly the cases where a
 * teacher later wants to know how long a student was actually there.
 *
 * LiveKit knows. It notices the connection die and posts here. So this is the
 * reliable half of the pair, arriving seconds later, and it only ever fills a
 * row that is still open — whichever of the two lands first wins and the other
 * quietly does nothing.
 *
 * SECURITY: the body is signed. `WebhookReceiver.receive` verifies the
 * `Authorization` header against a SHA-256 of the raw body using the project's
 * API secret, so the body must be read as text and passed through untouched —
 * `request.json()` would parse it and lose the exact bytes the hash covers.
 *
 * SETUP (once, by hand): LiveKit Cloud → project → Settings → Webhooks →
 * https://novicetutor.com/api/webhooks/livekit. Until that exists, joins and
 * ordinary leaves are still recorded; only crash-durations go missing.
 */

import { NextRequest, NextResponse } from "next/server";
import { WebhookReceiver } from "livekit-server-sdk";
import { and, eq } from "drizzle-orm";
import { db, withDb } from "@/lib/db";
import { sessionAttendance, sessions, bookings, studentProfiles } from "@/db/schema";
import { baseIdentity, isScreenShareIdentity, sessionIdFromRoomName } from "@/lib/livekit";
import { closeAttendanceRows } from "@/lib/attendance";
import { classRosterUserIds } from "@/lib/class-ring";
import { sendClassEndedPush } from "@/lib/fcm";
import { afterResponse } from "@/lib/after-response";
import { users } from "@/db/schema";

export const dynamic = "force-dynamic";

let receiver: WebhookReceiver | null = null;
function getReceiver(): WebhookReceiver {
  if (!receiver) {
    const key = process.env.LIVEKIT_API_KEY;
    const secret = process.env.LIVEKIT_API_SECRET;
    if (!key || !secret) throw new Error("LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be configured");
    receiver = new WebhookReceiver(key, secret);
  }
  return receiver;
}

/**
 * Open a row for a participant the join API never recorded.
 *
 * Not the normal path — the join API writes the row and knows far more than a
 * webhook does (which booking, which student profile, whether this is an admin
 * observing rather than attending). This is the backstop for when that write
 * failed, and it works from the only thing the webhook carries: the email in
 * front of the '#'.
 */
async function backfillJoin(sessionId: string, identity: string, joinedAt: Date) {
  const email = baseIdentity(identity);
  if (!email.includes("@")) return; // A guest, not an account. Nothing to attribute.

  const [session, user] = await Promise.all([
    db.query.sessions.findFirst({
      where: eq(sessions.id, sessionId),
      columns: { id: true, orgId: true, teacherId: true },
    }),
    db.query.users.findFirst({
      where: eq(users.email, email),
      columns: { id: true, role: true },
    }),
  ]);
  if (!session || !user) return;

  const booking = await db.query.bookings.findFirst({
    where: and(eq(bookings.sessionId, sessionId), eq(bookings.userId, user.id)),
    columns: { studentProfileId: true },
  });

  const isTeacher = session.teacherId === user.id;
  const profileId =
    booking?.studentProfileId ??
    (isTeacher
      ? null
      : (
          await db.query.studentProfiles.findFirst({
            where: eq(studentProfiles.userId, user.id),
            columns: { id: true },
          })
        )?.id ?? null);

  await db
    .insert(sessionAttendance)
    .values({
      orgId: session.orgId,
      sessionId,
      userId: user.id,
      studentProfileId: profileId,
      role: isTeacher ? "TEACHER" : booking || profileId ? "STUDENT" : "OBSERVER",
      identity,
      joinedAt,
    })
    .onConflictDoNothing();
}

export async function POST(request: NextRequest) {
  return withDb(async () => {
    try {
      const body = await request.text();
      const authHeader = request.headers.get("Authorization");
      if (!authHeader) {
        return NextResponse.json({ error: "Missing Authorization" }, { status: 401 });
      }

      let event;
      try {
        event = await getReceiver().receive(body, authHeader);
      } catch {
        // An unverifiable body is not a transient failure — say so rather than
        // swallowing it into a 200, or a misconfigured secret looks like a
        // working webhook that simply never records anything.
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }

      const roomName = event.room?.name;
      const sessionId = roomName ? sessionIdFromRoomName(roomName) : null;
      if (!sessionId) return NextResponse.json({ received: true });

      // LiveKit timestamps are seconds; a `createdAt` of 0/absent means "now".
      const at = event.createdAt ? new Date(Number(event.createdAt) * 1000) : new Date();
      const identity = event.participant?.identity;

      // The Android shell joins a second time to publish the screen — that
      // connection is a capture device, not a person in the class.
      const isPerson = !!identity && !isScreenShareIdentity(identity);

      switch (event.event) {
        case "participant_joined":
          if (isPerson) await backfillJoin(sessionId, identity!, at);
          break;
        case "participant_left":
          if (isPerson) await closeAttendanceRows({ sessionId, identity: identity!, at });
          break;
        case "room_finished": {
          // The room is gone, so anybody still shown as present isn't. This
          // catches the last person out, whose own `participant_left` can be
          // lost in the same teardown that closed the room.
          await closeAttendanceRows({ sessionId, at });
          // And the class itself is over. This used to be the job of a
          // `pagehide` beacon on the teacher's client, which was removed
          // because it also fired when the OS killed the app — ending a class
          // the teacher was about to rejoin. LiveKit closing the room is the
          // honest signal: it only happens once nobody has been connected for
          // `emptyTimeout` (see the join route), or because the host ended it
          // deliberately, in which case /end already set this and the update
          // below matches nothing.
          const completed = await db
            .update(sessions)
            .set({ status: "COMPLETED", actualEnd: at })
            .where(and(eq(sessions.id, sessionId), eq(sessions.status, "IN_PROGRESS")))
            .returning({
              teacherId: sessions.teacherId,
              scheduledStart: sessions.scheduledStart,
            });

          // Only when *this* update is what ended the class. The host pressing
          // End already sent this push and already matched the row, so the
          // returning list is empty here and nobody gets told twice.
          if (completed[0]) {
            const ended = completed[0];
            afterResponse(
              classRosterUserIds({
                canonical: ended,
                teacherId: ended.teacherId,
                includeFinished: true,
              }).then((userIds) =>
                userIds.length ? sendClassEndedPush(userIds, sessionId) : 0
              )
            );
          }
          break;
        }
        default:
          break;
      }

      return NextResponse.json({ received: true });
    } catch (error) {
      // A webhook that answers 500 is retried, forever, for an event that will
      // never succeed. Log it and take the 200 — a missing leave time is worth
      // far less than a retry storm.
      console.error("[livekit-webhook]", error);
      return NextResponse.json({ received: true });
    }
  });
}
