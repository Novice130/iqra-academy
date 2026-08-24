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
import { and, eq } from "drizzle-orm";
import { sessions, bookings, studentProfiles, sessionAttendance } from "@/db/schema";
import { requireAuth } from "@/lib/rbac";
import { handleApiError, NotFoundError, ForbiddenError } from "@/lib/errors";
import { generateLiveKitToken, generateRoomName, getRoomServiceClient, makeIdentity } from "@/lib/livekit";
import { parseRoomMetadata, patchRoomMetadata } from "@/lib/room-metadata";
import { resolveClassRoom } from "@/lib/class-room";
import { ringClassStudents } from "@/lib/class-ring";
import { afterResponse } from "@/lib/after-response";
import { createTimings, withTimings } from "@/lib/server-timing";
import { createId } from "@paralleldrive/cuid2";

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
      const { id: sessionId } = await params;

      // One query, not three. This route is on the critical path between
      // tapping Join and seeing video, and every Neon round trip here is
      // ~500ms of a student staring at a spinner — measured at ~4s for this
      // function before a token was even minted.
      //
      // `requireAuth` has already read this user's row, so `ctx` stands in
      // for the second lookup that used to sit in this Promise.all, and the
      // class teacher — who may not be the caller, since an admin can join to
      // observe — comes back through the `teacher` relation rather than as a
      // follow-up query that had to wait for `session` to resolve first.
      const session = await timings.track(
        "load",
        db.query.sessions.findFirst({
          where: eq(sessions.id, sessionId),
          with: {
            bookings: true,
            teacher: { columns: { email: true, name: true } },
          },
        })
      );

      if (!session) throw new NotFoundError("Session");

      const user = { email: ctx.email, name: ctx.name, role: ctx.role, orgId: ctx.orgId };
      const sessionTeacher = session.teacher ?? undefined;

      // This class was combined into another one (see lib/class-merge.ts).
      // The row still exists, cancelled, holding its own history — but the
      // class it stood for happens elsewhere now. Anyone arriving on an old
      // link, an old push notification or a bookmark follows the pointer.
      // Checked before the room resolver, which reasons about time slots and
      // would send them to a room nobody else is in.
      if (session.mergedIntoId) {
        return withTimings(NextResponse.json({ redirectSessionId: session.mergedIntoId }), timings);
      }

      // An admin can join only their own org's sessions. SUPER_ADMIN is the
      // only role allowed across orgs.
      const isAdmin =
        user.role === "SUPER_ADMIN" ||
        (user.role === "ORG_ADMIN" && user.orgId === session.orgId);
      const isTeacher = session.teacherId === ctx.userId || isAdmin;
      let isStudent = session.bookings.some((b: any) => b.userId === ctx.userId);
      const isInstantMeeting = session.consumesQuota === false && session.title?.startsWith("Instant Meeting");

      // Where is this class actually happening? Everyone asks the same
      // question and gets the same answer, so nobody opens a second room.
      const resolution = await timings.track("resolve", resolveClassRoom(session));
      const isTheRoom = resolution.session.id === sessionId && resolution.kind !== "too-early";

      // Auto-book on the way in. Ensures anyone holding the class link with an account can join.
      if (!isStudent && !isTeacher) {
        const existingProfiles = await db.query.studentProfiles.findMany({
          where: eq(studentProfiles.userId, ctx.userId),
        });

        let profile = existingProfiles[0];
        if (!profile) {
          const profileId = createId();
          await db.insert(studentProfiles).values({
            id: profileId,
            orgId: session.orgId,
            userId: ctx.userId,
            name: user.name || "Student",
            track: "QAIDAH",
          });
          profile = { id: profileId, orgId: session.orgId, userId: ctx.userId, name: user.name || "Student", track: "QAIDAH" } as any;
        }

        if (profile) {
          await db.insert(bookings).values({
            id: createId(),
            orgId: session.orgId,
            userId: ctx.userId,
            studentProfileId: profile.id,
            sessionId: session.id,
            status: "CONFIRMED",
          }).catch(() => {});
          isStudent = true;
        }
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

      // Whoever walks in first opens the class — a student half an hour early
      // included, because being early should put you *in* the room where the
      // others will find you. Nothing else in the app ever flipped SCHEDULED
      // to IN_PROGRESS, so a regular class used to stay "SCHEDULED" for its
      // whole duration, invisible to the admins' live-classes panel and to
      // the students' ribbon, both of which key off IN_PROGRESS.
      //
      // An admin dropping in to observe is the one exception: they are
      // neither teaching nor attending, and their visit must not mark a class
      // as having begun.
      const isOwningTeacher = session.teacherId === ctx.userId;
      const isAttending = isOwningTeacher || isStudent;
      const isConnecting = request.nextUrl.searchParams.get("connecting") === "1";
      const shouldMarkStarted = isAttending && session.status === "SCHEDULED";

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
            sessionId,
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
      //
      // The teacher arriving is what rings the class. Gated on `connecting=1`
      // like the attendance write, for the same reason: this route is also hit
      // on page mount, and a teacher who opens a class and then sits on the
      // device picker has not started it.
      //
      // Only the *owning* teacher — an admin dropping in to observe must not
      // summon a class. Re-ringing on reconnect is handled inside
      // ringClassStudents, which matters now that a teacher who drops off
      // comes straight back through here.
      //
      // A push per booked student used to sit between the teacher tapping Join
      // and their own token coming back, which is the one person in the class
      // who should never be waiting on it.
      if (isConnecting && isOwningTeacher) {
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
      //
      // Also deferred: it is two or three LiveKit round trips, and the client
      // does not need it to connect. The response already carries
      // `teacherIdentity` precisely so a client can focus the teacher before
      // any spotlight metadata lands, and ensureSpotlight's own backfill is
      // written to cope with a room that got auto-created first — which is the
      // same race whether it runs before the response or just after it.
      if (isAttending) {
        afterResponse(ensureSpotlight());
      }

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
              .where(eq(sessions.id, sessionId))
          : Promise.resolve(),
        !session.videoRoomName
          ? db
              .update(sessions)
              .set({ videoRoomName: roomName })
              .where(eq(sessions.id, sessionId))
          : Promise.resolve(),
      ]));

      return withTimings(NextResponse.json({
        roomName,
        token,
        serverUrl: process.env.LIVEKIT_URL || "wss://meet.novicetutor.com",
        userName: user?.name || "Participant",
        joinUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://novicetutor.com"}/dashboard/session/${sessionId}`,
        isModerator: isTeacher,
        // The identity inside the token. The client sends it back when it
        // leaves, so the right connection's attendance row gets closed even
        // when the same person is in the room from two devices.
        identity,
        // Who the class teacher is, so a student's client can focus them by
        // default even before any spotlight metadata has landed.
        teacherIdentity: sessionTeacher?.email || null,
        teacherName: sessionTeacher?.name || null,
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
