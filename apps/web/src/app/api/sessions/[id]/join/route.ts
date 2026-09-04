/**
 * @fileoverview Session Join API — issues the LiveKit token for a session.
 *
 * RBAC: STUDENT or TEACHER
 * GET /api/sessions/[id]/join
 *
 * THE ONE RULE HERE: one class, one room, whoever arrives first.
 *
 * A class is spread over several session rows — a group row plus an INDIVIDUAL
 * row per student — and each person's dashboard links at their own. Since
 * LiveKit creates a room on join, "join the room named after my row" gave
 * every student a private room and an empty screen, which is what happened to
 * a real class of three on 2026-08-06.
 *
 * Every request therefore resolves through `resolveClassRoom` to one canonical
 * row for the occurrence (see lib/class-room.ts) and answers with:
 *   1. a token, when that row is this one
 *   2. { redirectSessionId }, when the class is happening on another row
 *   3. { waiting: true }, only when the class isn't due at all yet
 *
 * A student who turns up early opens the room and waits *in* it; the next
 * student joins them; the teacher arriving late joins the same room.
 */

import { NextRequest, NextResponse } from "next/server";
import { db, withHttpDb } from "@/lib/db";
import { and, eq, or } from "drizzle-orm";
import { sessions, bookings, studentProfiles, sessionAttendance } from "@/db/schema";
import { requireAuth } from "@/lib/rbac";
import { handleApiError, NotFoundError, ForbiddenError, BusinessRuleError } from "@/lib/errors";
import { generateLiveKitToken, generateRoomName, getRoomServiceClient, makeIdentity } from "@/lib/livekit";
import { parseRoomMetadata, patchRoomMetadata } from "@/lib/room-metadata";
import { resolveClassRoom } from "@/lib/class-room";
import { ringClassStudents } from "@/lib/class-ring";
import { afterResponse } from "@/lib/after-response";
import { createTimings, withTimings } from "@/lib/server-timing";
import { loadOrgSession, assertSessionViewer } from "@/lib/session-access";

function normalizeJoinCode(code: string) {
  if (!code) return code;
  const trimmed = code.trim();
  const digitsOnly = trimmed.replace(/\D/g, '');
  if (digitsOnly.length === 12) {
    return `${digitsOnly.slice(0, 3)}-${digitsOnly.slice(3, 6)}-${digitsOnly.slice(6, 9)}-${digitsOnly.slice(9, 12)}`;
  }
  const clean = trimmed.replace(/[^a-zA-Z]/g, '').toLowerCase();
  if (clean.length === 12) {
    return `${clean.slice(0, 4)}-${clean.slice(4, 8)}-${clean.slice(8, 12)}`;
  }
  return trimmed;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // HTTP, not the WebSocket pool. Nothing in this route or anything it calls
  // — resolveClassRoom, ringClassStudents, requireAuth, Better Auth's own
  // session lookup — ever opens a transaction, so the pool's only effect here
  // was to charge every join a TLS + WebSocket handshake before the first
  // query could run. That handshake is on the critical path between a student
  // tapping Join and seeing video. If anything in this call graph ever needs
  // `db.transaction(...)` or `withRLS`, this has to go back to `withDb`.
  return withHttpDb(async () => {
    // Every response below carries a Server-Timing breakdown, so a real join
    // on a real connection reports where its seconds went. Measuring this
    // route from a laptop can't separate database time from the user's own
    // trip to the edge; this can. Read it in DevTools' Network panel, on the
    // join request, under Timing.
    const timings = createTimings();

    try {
      const authResult = await timings.track("auth", requireAuth(request));
      if (authResult instanceof NextResponse) return withTimings(authResult, timings);
      const ctx = authResult;
      const { id: rawId } = await params;
      const session = await timings.track(
        "load",
        loadOrgSession(ctx.orgId, rawId, ctx.role)
      );

      const user = { email: ctx.email, name: ctx.name, role: ctx.role, orgId: ctx.orgId };
      const sessionTeacher = session.teacher ?? undefined;
      const sessionId = session.id;

      // This class was combined into another one (see lib/class-merge.ts).
      // The row still exists, cancelled, holding its own history — but the
      // class it stood for happens elsewhere now. Anyone arriving on an old
      // link, an old push notification or a bookmark follows the pointer.
      // Checked before the room resolver, which reasons about time slots and
      // would send them to a room nobody else is in.
      if (session.mergedIntoId) {
        return withTimings(NextResponse.json({ redirectSessionId: session.mergedIntoId }), timings);
      }

      // Assert caller is an authorized viewer (assigned teacher, booked student, admin observer)
      // Any link-holder who is not booked or staff is denied. Auto-booking removed.
      const { isTeacher, isStudent, isAdmin } = assertSessionViewer(session, ctx);

      // Where is this class actually happening? Everyone asks the same
      // question and gets the same answer, so nobody opens a second room.
      const resolution = await timings.track("resolve", resolveClassRoom(session as any));
      const isTheRoom = resolution.session.id === sessionId && resolution.kind !== "too-early";

      if (session.status === "COMPLETED" || session.status === "CANCELLED" || resolution.session.status === "COMPLETED" || resolution.session.status === "CANCELLED") {
        throw new BusinessRuleError("This class has already ended.");
      }

      if (resolution.session.id !== sessionId) {
        // The class lives on another row — the teacher's group class, an
        // instant meeting, or simply whichever sibling row got picked as
        // canonical. Follow it.
        return withTimings(NextResponse.json({ redirectSessionId: resolution.session.id }), timings);
      }

      if (resolution.kind === "too-early") {
        // Not due yet. This is the only case that still holds someone
        // outside: opening a room hours ahead of a class helps nobody.
        return withTimings(
          NextResponse.json({
            waiting: true,
            sessionTitle: session.title,
            teacherName: sessionTeacher?.name || null,
            scheduledStart: session.scheduledStart?.toISOString() ?? null,
          }),
          timings
        );
      }

      // Only assigned teacher arrival marks scheduled class IN_PROGRESS.
      // Students and observers entering before the assigned teacher see the lobby until the teacher arrives.
      const isOwningTeacher = session.teacherId === ctx.userId;
      const isAttending = isOwningTeacher || isStudent;
      if (!isOwningTeacher && session.status === "SCHEDULED") {
        return withTimings(
          NextResponse.json({
            waiting: true,
            waitingForTeacher: true,
            sessionTitle: session.title,
            teacherName: sessionTeacher?.name || null,
            scheduledStart: session.scheduledStart?.toISOString() ?? null,
          }),
          timings
        );
      }

      if (resolution.kind === "expired") {
        // The scheduled window has elapsed and the class is not running.
        return withTimings(
          NextResponse.json({
            expired: true,
            sessionTitle: session.title,
            teacherName: sessionTeacher?.name || null,
            teacherIdentity: sessionTeacher?.email || null,
            scheduledStart: session.scheduledStart?.toISOString() ?? null,
            scheduledEnd: session.scheduledEnd?.toISOString() ?? null,
            isTeacher: !!isTeacher,
            isAdmin: !!isAdmin,
            isTrial: !!session.isTrial,
          }),
          timings
        );
      }

      const roomName = generateRoomName(sessionId);

      // Default the room's spotlight to the CLASS TEACHER so students land on
      // a stable "teacher is the main view" layout instead of LiveKit's
      // default active-speaker auto-focus. It used to default to whoever
      // triggered this call, which meant an admin dropping in to observe
      // became the big picture on every student's screen.
      //
      // createRoom alone isn't enough: if a student's connection reaches
      // LiveKit first, it can implicitly auto-create the room with empty
      // metadata and createRoom becomes a no-op, leaving spotlightIdentity
      // unset for the whole session. So after createRoom, check the room's
      // actual metadata and backfill — but never overwrite a spotlight the
      // teacher has already set by hand.
      const defaultSpotlight = sessionTeacher?.email || user.email;
      const ensureSpotlight = async () => {
        const svc = getRoomServiceClient();
        await svc
          .createRoom({
            name: roomName,
            metadata: JSON.stringify({ spotlightIdentity: defaultSpotlight }),
            // How long an EMPTY room survives before LiveKit closes it, which
            // in turn fires the `room_finished` webhook that closes out the
            // attendance rows. Ten minutes rather than LiveKit's default five,
            // because a teacher whose phone died has to be able to get back
            // into the same room — nothing on the client ends a class any
            // more except the host choosing to (see LiveKitRoom).
            //
            // Only counts while nobody is connected. A teacher who drops with
            // students still in the room leaves it non-empty, so the class
            // keeps running for them — which is the point.
            emptyTimeout: 600,
          })
          .catch(() => {});
        try {
          const rooms = await svc.listRooms([roomName]);
          const existing = parseRoomMetadata(rooms[0]?.metadata);
          if (!existing.spotlightIdentity) {
            // Merge, never replace — the room may already carry the volumes
            // the teacher set earlier in this class.
            await patchRoomMetadata(roomName, { spotlightIdentity: defaultSpotlight });
          }
        } catch {
          // Best-effort — worst case the room falls back to LiveKit's
          // default active-speaker view instead of a stable teacher focus.
        }
      };

      const isConnecting = request.nextUrl.searchParams.get("connecting") === "1";
      const shouldMarkStarted = isOwningTeacher && session.status === "SCHEDULED";

      /**
       * Close this person's previous connection before handing out a new one.
       *
       * Identities are `email#random` (see lib/livekit.ts), unique per
       * connection, so LiveKit's own duplicate-identity eviction never fires
       * and the same human can end up in the room twice. That is not
       * hypothetical: a student got the "class has started" notification,
       * tapped it, then the teacher rang them, and tapping Join put a second
       * copy of him in the class. Two tiles, two microphones in one room —
       * which is also an echo.
       *
       * The likeliest cause is not two live windows but one: navigating the
       * WebView from the notification's page to the call's page tears the old
       * page down without LiveKit always getting a clean leave, and the ghost
       * lingers until the server times it out.
       *
       * The screen publisher is deliberately spared. It shares the same email
       * prefix but is a separate, intentional connection — removing it here
       * would mean a teacher who rejoins kills their own screen share.
       */
      const dropStaleConnections = async () => {
        const email = user?.email;
        if (!email) return;
        try {
          const svc = getRoomServiceClient();
          const participants = await svc.listParticipants(roomName);
          await Promise.all(
            participants
              .filter((p) => p.identity.startsWith(`${email}#`) && !p.identity.includes("#screen-"))
              .map((p) => svc.removeParticipant(roomName, p.identity).catch(() => {}))
          );
        } catch {
          // Best-effort. A duplicate tile is worse than this failing, but not
          // worse than refusing to let someone into their own class.
        }
      };

      // Before the token, not alongside it: the removal has to land before
      // the client reconnects, or it races and can evict the new connection.
      //
      // Only when the caller is about to connect. This route is also hit on
      // page mount, before the pre-join screen — sweeping there meant merely
      // opening a class on a second device kicked you out of the class you
      // were actually in on the first, even if you then sat on the device
      // picker and never joined. The client asks for `connecting=1` at the
      // moment it hands the token to LiveKit.
      //
      // Not gated on `isAttending`: an observing admin gets the same
      // `email#random` identity and duplicates themselves the same way.
      if (isConnecting) await timings.track("sweep", dropStaleConnections());

      // Minted here rather than inside the token so the attendance row can name
      // the exact connection it belongs to. That is what lets the
      // `participant_left` webhook close out the right row when the same
      // person is in the room twice.
      const identity = makeIdentity(user?.email || user?.name || "participant");

      /**
       * Who was actually in this class, and when they arrived.
       *
       * Only on `connecting=1`. This route is also hit on page mount, before
       * the pre-join screen, and someone who opens a class and then sits on
       * the device picker without ever joining did not attend it.
       *
       * `sessionId` is the canonical row for the occurrence — the function
       * already returned above if it weren't — so every row for one class
       * lands together without the report having to stitch them back.
       *
       * Best-effort, like the room bookkeeping beside it: a failure to record
       * attendance must never be a reason somebody can't get into their class.
       */
      const recordJoin = async () => {
        const studentProfileId =
          session.bookings.find((b: any) => b.userId === ctx.userId)?.studentProfileId ??
          (isStudent
            ? (
                await db.query.studentProfiles.findFirst({
                  where: eq(studentProfiles.userId, ctx.userId),
                  columns: { id: true },
                })
              )?.id ?? null
            : null);

        await db
          .insert(sessionAttendance)
          .values({
            orgId: session.orgId,
            sessionId: session.id,
            userId: ctx.userId,
            studentProfileId,
            role: isOwningTeacher ? "TEACHER" : isStudent ? "STUDENT" : "OBSERVER",
            identity,
            joinedAt: new Date(),
          })
          // The client can retry the token request; the identity is unique per
          // connection, so a retry that reuses it must not double-count.
          .onConflictDoNothing();
      };

      // Deferred, not awaited — see lib/after-response.
      if (isOwningTeacher && isConnecting) {
        afterResponse(
          ringClassStudents({
            canonical: session,
            roomName,
            teacherId: ctx.userId,
            teacherName: user?.name || "Your teacher",
          })
        );
      }

      // Seed the spotlight whoever opens the room — it always names the class
      // teacher, so a student opening early still lands everyone on the
      // teacher once they arrive.
      if (isAttending) {
        afterResponse(ensureSpotlight());
      }

      // Mark started and remember the room name atomically before answering.
      //
      // Two separate updates were racing: a student arriving first updated
      // videoRoomName, the teacher arriving seconds later updated status, and
      // both were reading a stale row. Bundled into one Promise.all so the
      // caller holds a coherent row the moment the token is handed back.
      const [token] = await timings.track("token", Promise.all([
        generateLiveKitToken({
          roomName,
          userName: user?.name || "Participant",
          userEmail: user?.email || "",
          isModerator: isTeacher,
          identity,
        }),
        isConnecting ? recordJoin().catch(() => {}) : Promise.resolve(),
        shouldMarkStarted
          ? db
              .update(sessions)
              .set({ status: "IN_PROGRESS", actualStart: session.actualStart ?? new Date() })
              .where(eq(sessions.id, session.id))
          : Promise.resolve(),
        !session.videoRoomName
          ? db
              .update(sessions)
              .set({ videoRoomName: roomName })
              .where(eq(sessions.id, session.id))
          : Promise.resolve(),
      ]));

      return withTimings(NextResponse.json({
        roomName,
        token,
        sessionId: session.id,
        serverUrl: process.env.LIVEKIT_URL || "wss://meet.novicetutor.com",
        userName: user?.name || "Participant",
        joinUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://novicetutor.com"}/dashboard/session/${session.id}`,
        isModerator: isTeacher,
        // The identity inside the token. The client sends it back when it
        // leaves, so the right connection's attendance row gets closed even
        // when the same person is in the room from two devices.
        identity,
        // Who the class teacher is, so a student's client can focus them by
        // default even before any spotlight metadata has landed.
        teacherIdentity: sessionTeacher?.email || null,
        teacherName: sessionTeacher?.name || null,
        joinCode: session.joinCode || null,
        sessionTitle: session.title || "Novice Tutor Classroom",
        // Distinct from isModerator on purpose: an admin observing another
        // teacher's class gets moderator *controls*, but is not the host.
        // Leaving must not end the class for the teacher still teaching it.
        isHost: isOwningTeacher,
      }), timings);
    } catch (error) {
      return withTimings(handleApiError(error), timings);
    }
  });
}
