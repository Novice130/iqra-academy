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
import {
  sessions,
  users,
  bookings,
  sessionAttendees,
  chatRooms,
  chatMessages,
  chatModerationActions,
  teacherFeedback,
  progressRecords,
} from "@/db/schema";
import { requireAuth } from "@/lib/rbac";
import { handleApiError, NotFoundError, ForbiddenError } from "@/lib/errors";

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

      await db.transaction(async (tx) => {
        const rooms = await tx.query.chatRooms.findMany({
          where: eq(chatRooms.sessionId, sessionId),
          columns: { id: true },
        });
        for (const room of rooms) {
          const messages = await tx.query.chatMessages.findMany({
            where: eq(chatMessages.roomId, room.id),
            columns: { id: true },
          });
          for (const message of messages) {
            await tx.delete(chatModerationActions).where(eq(chatModerationActions.messageId, message.id));
          }
          await tx.delete(chatMessages).where(eq(chatMessages.roomId, room.id));
        }
        await tx.delete(chatRooms).where(eq(chatRooms.sessionId, sessionId));

        await tx.delete(progressRecords).where(eq(progressRecords.sessionId, sessionId));
        await tx.delete(teacherFeedback).where(eq(teacherFeedback.sessionId, sessionId));
        await tx.delete(sessionAttendees).where(eq(sessionAttendees.sessionId, sessionId));
        await tx.delete(bookings).where(eq(bookings.sessionId, sessionId));
        await tx.delete(sessions).where(eq(sessions.id, sessionId));
      });

      return NextResponse.json({ success: true });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
