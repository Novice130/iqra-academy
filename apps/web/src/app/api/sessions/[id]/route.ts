/**
 * @fileoverview Single Session Management API
 *
 * RBAC: TEACHER (owner), ORG_ADMIN, SUPER_ADMIN
 * DELETE /api/sessions/[id] — Permanently deletes a session and its
 * dependent rows (bookings, attendees, chat rooms, feedback, progress).
 */

import { NextRequest, NextResponse } from "next/server";
import { db, withDb } from "@/lib/db";
import { eq } from "drizzle-orm";
import { sessions, users } from "@/db/schema";
import { deleteSessionCascade } from "@/lib/session-cleanup";
import { requireAuth } from "@/lib/rbac";
import { handleApiError, NotFoundError, ForbiddenError } from "@/lib/errors";
import { generateRoomName, getRoomServiceClient } from "@/lib/livekit";

export async function DELETE(
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
      const isOwner = session.teacherId === ctx.userId || isAdmin;

      if (!isOwner) {
        throw new ForbiddenError("Only the host or an admin can delete this session.");
      }

      // Deleting a session doesn't imply the LiveKit room is gone — force-close
      // it too, otherwise a still-open call keeps running (and billing) with no
      // DB row left to end it later. Not fatal if the room's already gone.
      const roomName = session.videoRoomName || generateRoomName(sessionId);
      await getRoomServiceClient().deleteRoom(roomName).catch(() => {});

      await db.transaction(async (tx) => {
        await deleteSessionCascade(tx as never, sessionId);
      });

      return NextResponse.json({ success: true });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
