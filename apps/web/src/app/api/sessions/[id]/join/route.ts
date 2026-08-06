/**
 * @fileoverview Session Join API — issues the LiveKit token for a session.
 *
 * RBAC: STUDENT or TEACHER
 * GET /api/sessions/[id]/join
 *
 * THE ONE RULE HERE: a student never opens a room. LiveKit auto-creates a room
 * on join, so handing a student a token for a class their teacher hasn't
 * started puts them alone in a room of their own making — and on 2026-08-06
 * that is exactly what happened to a real class of three, each student sitting
 * in a separate room built out of their own INDIVIDUAL session row while the
 * teacher waited somewhere else.
 *
 * So a student's request resolves to one of three things:
 *   1. this session is live      → token
 *   2. their teacher is live elsewhere → { redirectSessionId }
 *   3. nobody has started yet    → { waiting: true }, and the page holds them
 *      in a lobby that polls until (1) or (2) becomes true
 *
 * Only a teacher walking in starts a class, and that is what creates the room.
 */

import { NextRequest, NextResponse } from "next/server";
import { db, withDb } from "@/lib/db";
import { and, desc, eq, gt } from "drizzle-orm";
import { sessions, users, bookings, studentProfiles } from "@/db/schema";
import { requireAuth } from "@/lib/rbac";
import { handleApiError, NotFoundError, ForbiddenError } from "@/lib/errors";
import { generateLiveKitToken, generateRoomName, getRoomServiceClient } from "@/lib/livekit";
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

      // Auto-book on the way in for an instant meeting, or for any class this
      // teacher currently has running. Without the second case a student who
      // follows the "your teacher has started the class" ribbon into a session
      // they were never explicitly booked for gets a 403 and ends up back on
      // their own scheduled (empty) room — the exact split-room bug.
      if (!isStudent && !isTeacher && (isInstantMeeting || session.status === "IN_PROGRESS")) {
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

      // A student opening a session their teacher isn't in gets sent to the
      // room the teacher *is* in. Their dashboard links at their own
      // scheduled session, but the teacher's live class is very often a
      // different session row — a group class, or an instant meeting.
      if (!isTeacher && session.status !== "IN_PROGRESS") {
        const liveCutoff = new Date(Date.now() - 6 * 60 * 60 * 1000);
        const liveSession = await db.query.sessions.findFirst({
          where: and(
            eq(sessions.teacherId, session.teacherId),
            eq(sessions.status, "IN_PROGRESS"),
            gt(sessions.actualStart, liveCutoff)
          ),
          orderBy: [desc(sessions.actualStart)],
          columns: { id: true },
        });

        if (liveSession && liveSession.id !== sessionId) {
          return NextResponse.json({ redirectSessionId: liveSession.id });
        }

        // Nothing is running. Hold them in the lobby rather than issuing a
        // token: a token here would auto-create a room per student, which is
        // the split-class bug this route exists to prevent. Arriving early is
        // fine and expected — waiting is what early means.
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

      // The teacher walking into the room IS the class starting. Nothing else
      // in the app ever flipped a SCHEDULED session to IN_PROGRESS, so a
      // regular (non-instant) class stayed "SCHEDULED" for its whole
      // duration — invisible to the admins' live-classes panel and to the
      // students' "your teacher has started" ribbon, both of which key off
      // IN_PROGRESS. Only the session's own teacher starts it; an admin
      // dropping in to observe must not.
      const isOwningTeacher = session.teacherId === ctx.userId;
      const shouldMarkStarted = isOwningTeacher && session.status === "SCHEDULED";

      const [token] = await Promise.all([
        generateLiveKitToken({
          roomName,
          userName: user?.name || "Participant",
          userEmail: user?.email || "",
          isModerator: isTeacher,
        }),
        isTeacher ? ensureSpotlight() : Promise.resolve(),
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
