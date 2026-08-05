/**
 * @fileoverview Instant Meeting Cleanup API
 *
 * RBAC: TEACHER, ORG_ADMIN, SUPER_ADMIN
 * POST /api/teachers/instant-meeting/cleanup — Bulk-deletes instant meeting
 * sessions. Teachers clean up only their own; admins clean up the whole org.
 */

import { NextRequest, NextResponse } from "next/server";
import { db, withDb } from "@/lib/db";
import { and, eq, like } from "drizzle-orm";
import {
  sessions,
  bookings,
  sessionAttendees,
  chatRooms,
  chatMessages,
  chatModerationActions,
  teacherFeedback,
  progressRecords,
} from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { handleApiError } from "@/lib/errors";

export async function POST(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireRole(request, ["TEACHER", "ORG_ADMIN", "SUPER_ADMIN"]);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const isAdmin = ["ORG_ADMIN", "SUPER_ADMIN"].includes(ctx.role);

      const target = isAdmin
        ? and(eq(sessions.orgId, ctx.orgId), like(sessions.title, "Instant Meeting%"))
        : and(eq(sessions.teacherId, ctx.userId), like(sessions.title, "Instant Meeting%"));

      const toDelete = await db.query.sessions.findMany({
        where: target,
        columns: { id: true },
      });

      let deletedCount = 0;

      await db.transaction(async (tx) => {
        for (const { id: sessionId } of toDelete) {
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
          deletedCount++;
        }
      });

      return NextResponse.json({ success: true, deletedCount });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
