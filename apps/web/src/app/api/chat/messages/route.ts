/**
 * @fileoverview Chat Messages API (moderated in-session chat + persistent support chat)
 *
 * RBAC: STUDENT/TEACHER (GET/POST), TEACHER/ORG_ADMIN (moderation)
 * GET  /api/chat/messages?sessionId=xxx — Get chat messages for a session
 * GET  /api/chat/messages — Get messages for the student's persistent support thread
 * POST /api/chat/messages — Send a chat message (sessionId optional — omit for support chat)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRLS, withDb } from "@/lib/db";
import { eq, and, asc, isNull } from "drizzle-orm";
import { chatMessages, chatRooms, subscriptions } from "@/db/schema";
import { requireAuth } from "@/lib/rbac";
import { handleApiError, ForbiddenError, NotFoundError } from "@/lib/errors";

const sendMessageSchema = z.object({
  sessionId: z.string().min(1).optional(),
  content: z.string().min(1).max(500),
});

/** Deterministic name for a student's persistent 1:1 support room. */
function supportRoomName(studentUserId: string) {
  return `Support: ${studentUserId}`;
}

/** GET /api/chat/messages — fetch messages for a session, or the caller's support thread */
export async function GET(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireAuth(request);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const sessionId = new URL(request.url).searchParams.get("sessionId");

      return await withRLS(ctx, async (tx) => {
        let room;
        if (sessionId) {
          room = await tx.query.chatRooms.findFirst({
            where: and(eq(chatRooms.sessionId, sessionId), eq(chatRooms.orgId, ctx.orgId)),
          });
          if (!room) throw new NotFoundError("Chat room for this session");
        } else if (ctx.role === "STUDENT") {
          // No sessionId — this is the student's persistent support thread with the school.
          room = await tx.query.chatRooms.findFirst({
            where: and(
              eq(chatRooms.name, supportRoomName(ctx.userId)),
              eq(chatRooms.orgId, ctx.orgId),
              isNull(chatRooms.sessionId)
            ),
          });
          if (!room) return NextResponse.json({ messages: [] });
        } else {
          // Teachers/admins have no student selected yet — nothing to show.
          return NextResponse.json({ messages: [] });
        }

        const isTeacherOrAdmin = ctx.role === "TEACHER" || ctx.role === "ORG_ADMIN" || ctx.role === "SUPER_ADMIN";

        const conditions = [
          eq(chatMessages.roomId, room.id),
          eq(chatMessages.orgId, ctx.orgId),
        ];
        // Students don't see hidden or deleted messages
        if (!isTeacherOrAdmin) {
          conditions.push(eq(chatMessages.isHidden, false));
          conditions.push(eq(chatMessages.isDeleted, false));
        }

        const messages = await tx.query.chatMessages.findMany({
          where: and(...conditions),
          with: { sender: { columns: { id: true, name: true, role: true } } },
          orderBy: asc(chatMessages.createdAt),
        });

        return NextResponse.json({ messages });
      });
    } catch (error) {
      return handleApiError(error);
    }
  });
}

/** POST /api/chat/messages — send a message (free tier can't chat) */
export async function POST(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireAuth(request);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const body = await request.json();
      const { sessionId, content } = sendMessageSchema.parse(body);

      return await withRLS(ctx, async (tx) => {
        // Free tier students can't send chat messages
        if (ctx.role === "STUDENT") {
          const sub = await tx.query.subscriptions.findFirst({
            where: and(eq(subscriptions.userId, ctx.userId), eq(subscriptions.status, "ACTIVE")),
            with: { plan: true },
          });
          if (!sub || sub.plan.tier === "FREE") {
            throw new ForbiddenError("Chat is not available on the Free plan. Upgrade to send messages.");
          }
        }

        // Find or create the chat room: session-scoped if sessionId given,
        // otherwise the student's persistent support thread.
        let room;
        if (sessionId) {
          room = await tx.query.chatRooms.findFirst({
            where: and(eq(chatRooms.sessionId, sessionId), eq(chatRooms.orgId, ctx.orgId)),
          });
          if (!room) {
            const [newRoom] = await tx.insert(chatRooms).values({
              orgId: ctx.orgId,
              name: `Session ${sessionId}`,
              sessionId,
            }).returning();
            room = newRoom;
          }
        } else {
          if (ctx.role !== "STUDENT") {
            throw new ForbiddenError("Select a class to message in.");
          }
          const roomName = supportRoomName(ctx.userId);
          room = await tx.query.chatRooms.findFirst({
            where: and(
              eq(chatRooms.name, roomName),
              eq(chatRooms.orgId, ctx.orgId),
              isNull(chatRooms.sessionId)
            ),
          });
          if (!room) {
            const [newRoom] = await tx.insert(chatRooms).values({
              orgId: ctx.orgId,
              name: roomName,
              sessionId: null,
            }).returning();
            room = newRoom;
          }
        }

        const [message] = await tx.insert(chatMessages).values({
          orgId: ctx.orgId,
          roomId: room.id,
          senderId: ctx.userId,
          content,
        }).returning();

        // Fetch sender info for response
        const messageWithSender = await tx.query.chatMessages.findFirst({
          where: eq(chatMessages.id, message.id),
          with: { sender: { columns: { id: true, name: true, role: true } } },
        });

        return NextResponse.json({ message: messageWithSender }, { status: 201 });
      });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
