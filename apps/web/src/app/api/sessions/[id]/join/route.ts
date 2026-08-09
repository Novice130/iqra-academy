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
import { db, withDb } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { sessions, users, bookings, studentProfiles } from "@/db/schema";
import { requireAuth } from "@/lib/rbac";
import { handleApiError, NotFoundError, ForbiddenError } from "@/lib/errors";
import { generateLiveKitToken, generateRoomName, getRoomServiceClient } from "@/lib/livekit";
import { resolveClassRoom } from "@/lib/class-room";
import { createId } from "@paralleldrive/cuid2";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withDb(async () => {
    try {
      const authResult = await requireAuth(request);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;
      const { id: sessionId } = await params;

      const [session, user] = await Promise.all([
        db.query.sessions.findFirst({
          where: eq(sessions.id, sessionId),
          with: { bookings: true },
        }),
        db.query.users.findFirst({
          where: eq(users.id, ctx.userId),
        }),
      ]);

      // The class teacher, who may not be the person making this request —
      // an admin can be joining to observe.
      const sessionTeacher = session
        ? await db.query.users.findFirst({
            where: eq(users.id, session.teacherId),
            columns: { email: true, name: true },
          })
        : undefined;

      if (!session) throw new NotFoundError("Session");
      if (!user) throw new NotFoundError("User");

      const isAdmin = ["ORG_ADMIN", "SUPER_ADMIN"].includes(user.role);
      const isTeacher = session.teacherId === ctx.userId || isAdmin;
      let isStudent = session.bookings.some((b: any) => b.userId === ctx.userId);
      const isInstantMeeting = session.consumesQuota === false && session.title?.startsWith("Instant Meeting");

      // Where is this class actually happening? Everyone asks the same
      // question and gets the same answer, so nobody opens a second room.
      const resolution = await resolveClassRoom(session);
      const isTheRoom = resolution.session.id === sessionId && resolution.kind !== "too-early";

      // Auto-book on the way in for an instant meeting, for a class this
      // teacher currently has running, or for the row that *is* the room for
      // this occurrence. Without this a student redirected onto the teacher's
      // group row — a row they were never booked on — gets a 403 and bounces
      // back to their own empty session, which is the split-room bug itself.
      if (!isStudent && !isTeacher && (isInstantMeeting || session.status === "IN_PROGRESS" || isTheRoom)) {
        const [profiles, taughtBefore] = await Promise.all([
          db.query.studentProfiles.findMany({
            where: eq(studentProfiles.userId, ctx.userId),
          }),
          // Roster check: has this teacher ever taught this user before?
          db
            .select({ id: bookings.id })
            .from(bookings)
            .innerJoin(sessions, eq(bookings.sessionId, sessions.id))
            .where(and(eq(bookings.userId, ctx.userId), eq(sessions.teacherId, session.teacherId)))
            .limit(1),
        ]);

        // Still a roster check: the student has to be someone this teacher has
        // actually taught. An instant meeting is the exception — its whole
        // point is pulling in whoever the teacher just handed the link to.
        if (profiles.length > 0 && (isInstantMeeting || taughtBefore.length > 0)) {
           await db.insert(bookings).values({
             id: createId(),
             orgId: session.orgId,
             userId: ctx.userId,
             studentProfileId: profiles[0].id,
             sessionId: session.id,
             status: "CONFIRMED",
           });
           isStudent = true;
        }
      }

      if (!isTeacher && !isStudent) {
        throw new ForbiddenError("You are not part of this session.");
      }

      if (resolution.session.id !== sessionId) {
        // The class lives on another row — the teacher's group class, an
        // instant meeting, or simply whichever sibling row got picked as
        // canonical. Follow it.
        return NextResponse.json({ redirectSessionId: resolution.session.id });
      }

      if (resolution.kind === "too-early") {
        // Not due yet. This is the only case that still holds someone
        // outside: opening a room hours ahead of a class helps nobody.
        return NextResponse.json({
          waiting: true,
          sessionTitle: session.title,
          teacherName: sessionTeacher?.name || null,
          scheduledStart: session.scheduledStart?.toISOString() ?? null,
        });
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
          .createRoom({ name: roomName, metadata: JSON.stringify({ spotlightIdentity: defaultSpotlight }) })
          .catch(() => {});
        try {
          const rooms = await svc.listRooms([roomName]);
          const existing = rooms[0]?.metadata ? JSON.parse(rooms[0].metadata) : {};
          if (!existing.spotlightIdentity) {
            await svc.updateRoomMetadata(
              roomName,
              JSON.stringify({ ...existing, spotlightIdentity: defaultSpotlight })
            );
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
      if (isConnecting) await dropStaleConnections();

      const [token] = await Promise.all([
        generateLiveKitToken({
          roomName,
          userName: user?.name || "Participant",
          userEmail: user?.email || "",
          isModerator: isTeacher,
        }),
        // Seed the spotlight whoever opens the room — it always names the
        // class teacher, so a student opening early still lands everyone on
        // the teacher once they arrive.
        isAttending ? ensureSpotlight() : Promise.resolve(),
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
      ]);

      return NextResponse.json({
        roomName,
        token,
        serverUrl: process.env.LIVEKIT_URL || "wss://meet.novicetutor.com",
        userName: user?.name || "Participant",
        joinUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://novicetutor.com"}/dashboard/session/${sessionId}`,
        isModerator: isTeacher,
        // Who the class teacher is, so a student's client can focus them by
        // default even before any spotlight metadata has landed.
        teacherIdentity: sessionTeacher?.email || null,
        teacherName: sessionTeacher?.name || null,
        // Distinct from isModerator on purpose: an admin observing another
        // teacher's class gets moderator *controls*, but is not the host.
        // Leaving must not end the class for the teacher still teaching it.
        isHost: isOwningTeacher,
      });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
