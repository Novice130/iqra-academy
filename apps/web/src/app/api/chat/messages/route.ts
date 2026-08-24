/**
 * @fileoverview Chat Messages API (moderated in-session chat + persistent support chat)
 *
 * RBAC: STUDENT/TEACHER (GET/POST), TEACHER/ORG_ADMIN (moderation)
 * GET  /api/chat/messages?sessionId=xxx — Get chat messages for a session
 * GET  /api/chat/messages — Get messages for the caller's persistent support thread (STUDENT)
 * GET  /api/chat/messages?studentId=xxx — Get messages for a student's support thread (TEACHER/ADMIN)
 * POST /api/chat/messages — Send a chat message (sessionId or studentId optional depending on role)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRLS, withDb } from "@/lib/db";
import { eq, and, asc, isNull, gte, lt, sql } from "drizzle-orm";
import { chatMessages, chatRooms, notifications, subscriptions, users } from "@/db/schema";
import { requireAuth } from "@/lib/rbac";
import { handleApiError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { createId } from "@paralleldrive/cuid2";

const sendMessageSchema = z.object({
  sessionId: z.string().min(1).optional(),
  studentId: z.string().min(1).optional(),
  content: z.string().min(1).max(2000000), // Supports text, image embeds, and video links
});

const STAFF_ROLES = ["TEACHER", "ORG_ADMIN", "SUPER_ADMIN"];

/** Deterministic name for a student's persistent 1:1 support room. */
function supportRoomName(studentUserId: string) {
  return `Support: ${studentUserId}`;
}

/** GET /api/chat/messages — fetch messages for a session, a student's support thread, or the caller's own */
export async function GET(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireAuth(request);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const { searchParams } = new URL(request.url);
      const sessionId = searchParams.get("sessionId");
      const studentId = searchParams.get("studentId");

      return await withRLS(ctx, async (tx) => {
        // Opportunistically clean up messages older than 2 months (60 days)
        try {
          await tx
            .delete(chatMessages)
            .where(
              and(
                eq(chatMessages.orgId, ctx.orgId),
                lt(chatMessages.createdAt, sql`NOW() - INTERVAL '60 days'`)
              )
            );
        } catch {
          // Non-blocking cleanup
        }

        let room;
        if (sessionId) {
          room = await tx.query.chatRooms.findFirst({
            where: and(eq(chatRooms.sessionId, sessionId), eq(chatRooms.orgId, ctx.orgId)),
          });
          if (!room) throw new NotFoundError("Chat room for this session");
        } else if (studentId) {
          if (!STAFF_ROLES.includes(ctx.role)) {
            throw new ForbiddenError("Only staff can view a student's support thread.");
          }
          room = await tx.query.chatRooms.findFirst({
            where: and(
              eq(chatRooms.name, supportRoomName(studentId)),
              eq(chatRooms.orgId, ctx.orgId),
              isNull(chatRooms.sessionId)
            ),
          });
          if (!room) return NextResponse.json({ messages: [] });
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
          // Staff with no student selected — nothing to show.
          return NextResponse.json({ messages: [] });
        }

        const isStaff = STAFF_ROLES.includes(ctx.role);

        const conditions = [
          eq(chatMessages.roomId, room.id),
          eq(chatMessages.orgId, ctx.orgId),
          gte(chatMessages.createdAt, sql`NOW() - INTERVAL '60 days'`),
        ];
        // Students don't see hidden or deleted messages
        if (!isStaff) {
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

/** POST /api/chat/messages — send a message (free tier students can't chat) */
export async function POST(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireAuth(request);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const body = await request.json();
      const { sessionId, studentId, content } = sendMessageSchema.parse(body);

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

        // Resolve (find-or-create) the room: session-scoped, a specific
        // student's support thread (staff replying), or the caller's own
        // support thread (student messaging the school).
        let roomName: string;
        let roomSessionId: string | null = null;

        if (sessionId) {
          roomName = `Session ${sessionId}`;
          roomSessionId = sessionId;
        } else if (studentId) {
          if (!STAFF_ROLES.includes(ctx.role)) {
            throw new ForbiddenError("Only staff can reply in a student's support thread.");
          }
          roomName = supportRoomName(studentId);
        } else {
          if (ctx.role !== "STUDENT") {
            throw new ForbiddenError("Select a class or student to message.");
          }
          roomName = supportRoomName(ctx.userId);
        }

        const roomWhere = roomSessionId
          ? and(eq(chatRooms.sessionId, roomSessionId), eq(chatRooms.orgId, ctx.orgId))
          : and(eq(chatRooms.name, roomName), eq(chatRooms.orgId, ctx.orgId), isNull(chatRooms.sessionId));

        let room = await tx.query.chatRooms.findFirst({ where: roomWhere });
        if (!room) {
          const [newRoom] = await tx.insert(chatRooms).values({
            orgId: ctx.orgId,
            name: roomName,
            sessionId: roomSessionId,
          }).returning();
          room = newRoom;
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

        // Notify the student when staff replies in their support thread —
        // the polling banner (no push infra exists here yet) surfaces it.
        if (studentId && STAFF_ROLES.includes(ctx.role)) {
          const sender = await tx.query.users.findFirst({
            where: eq(users.id, ctx.userId),
            columns: { name: true },
          });
          await tx.insert(notifications).values({
            id: createId(),
            orgId: ctx.orgId,
            userId: studentId,
            type: "NEW_MESSAGE",
            message: `${sender?.name || "Your teacher"} sent you a message.`,
          });
        }

        return NextResponse.json({ message: messageWithSender }, { status: 201 });
      });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
