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

      const session = await db.query.sessions.findFirst({
        where: eq(sessions.id, sessionId),
      });
      if (!session) throw new NotFoundError("Session");

      const user = await db.query.users.findFirst({
        where: eq(users.id, ctx.userId),
      });
      const isAdmin = user ? ["ORG_ADMIN", "SUPER_ADMIN"].includes(user.role) : false;
      const isHost = session.teacherId === ctx.userId || isAdmin;

      if (!isHost) {
        throw new ForbiddenError("Only the host can end this session.");
      }

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
      const roomName = session.videoRoomName || generateRoomName(sessionId);
      await getRoomServiceClient().deleteRoom(roomName).catch(() => {});

      return NextResponse.json({ success: true });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
