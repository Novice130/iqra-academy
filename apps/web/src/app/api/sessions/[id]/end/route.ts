/**
 * @fileoverview Session End API
 *
 * RBAC: TEACHER, ORG_ADMIN, SUPER_ADMIN (must own the session or be an admin)
 * POST /api/sessions/[id]/end — Marks a session COMPLETED when the host
 * leaves, AND force-closes the underlying LiveKit room. Previously this
 * only touched the DB — the LiveKit room stayed open and kept billing
 * participant-minutes for anyone still connected (or slow to disconnect)
 * until LiveKit's own empty-room timeout eventually caught it.
 */

import { NextRequest, NextResponse } from "next/server";
import { db, withDb } from "@/lib/db";
import { eq } from "drizzle-orm";
import { sessions, users } from "@/db/schema";
import { requireAuth } from "@/lib/rbac";
import { handleApiError, NotFoundError, ForbiddenError } from "@/lib/errors";
import { generateRoomName, getRoomServiceClient } from "@/lib/livekit";
import { closeAttendanceRows } from "@/lib/attendance";
import { classRosterUserIds } from "@/lib/class-ring";
import { sendClassEndedPush } from "@/lib/fcm";
import { afterResponse } from "@/lib/after-response";
import { loadOrgSession, assertSessionHost } from "@/lib/session-access";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withDb(async () => {
    try {
      const authResult = await requireAuth(request);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;
      const { id: sessionId } = await params;

      const session = await loadOrgSession(ctx.orgId, sessionId, ctx.role);
      assertSessionHost(session, ctx);

      const endedAt = new Date();

      if (session.status === "IN_PROGRESS") {
        await db
          .update(sessions)
          .set({ status: "COMPLETED", actualEnd: endedAt })
          .where(eq(sessions.id, sessionId));
      }

      // The class is over, so nobody is still in it. Anyone whose own leave
      // never landed — the room is about to be deleted underneath them —
      // is closed out here rather than left looking permanently present.
      await closeAttendanceRows({ sessionId, at: endedAt }).catch(() => {});

      // Force-close the room immediately — disconnects any straggling
      // participants right now instead of waiting on LiveKit's empty-room
      // timeout. Not fatal if the room's already gone.
      //
      // try/catch rather than `.catch()`: `getRoomServiceClient()` throws
      // *synchronously* when the LiveKit keys are missing, which no promise
      // handler can catch — so a local environment without them 500'd this
      // whole route after the class had already been marked COMPLETED, and
      // the teacher saw an error for something that had worked.
      const roomName = session.videoRoomName || generateRoomName(sessionId);
      try {
        await getRoomServiceClient().deleteRoom(roomName);
      } catch {
        // Already gone, or no room service configured. The class is over
        // either way.
      }

      // Tell every booked phone to drop the "Join classroom now" card. Anyone
      // who was *in* the room learns instantly from LiveKit's `roomDeleted`;
      // this is for the student who never joined and whose app is otherwise
      // waiting on its next poll. Deferred so the teacher's tap doesn't wait
      // on N push round-trips.
      afterResponse(
        classRosterUserIds({
          canonical: session,
          teacherId: session.teacherId,
          includeFinished: true,
        }).then((userIds) =>
          userIds.length ? sendClassEndedPush(userIds, sessionId) : 0
        )
      );

      return NextResponse.json({ success: true });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
