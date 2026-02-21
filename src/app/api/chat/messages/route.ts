/**
 * @fileoverview Chat Messages API (moderated in-session chat)
 *
 * RBAC: STUDENT/TEACHER (GET/POST), TEACHER/ORG_ADMIN (moderation)
 * GET  /api/chat/messages?sessionId=xxx — Get chat messages for a session
 * POST /api/chat/messages — Send a chat message
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { eq, and, asc } from "drizzle-orm";
import { chatMessages, subscriptions } from "@/db/schema";
import { requireAuth } from "@/lib/rbac";
import { handleApiError, ForbiddenError } from "@/lib/errors";

const sendMessageSchema = z.object({
  sessionId: z.string().min(1),
  content: z.string().min(1).max(500),
});

/** GET /api/chat/messages — fetch messages for a session */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const ctx = authResult;

    const sessionId = new URL(request.url).searchParams.get("sessionId");
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    const isTeacherOrAdmin = ctx.role === "TEACHER" || ctx.role === "ORG_ADMIN" || ctx.role === "SUPER_ADMIN";

    const conditions = [
      eq(chatMessages.sessionId, sessionId),
      eq(chatMessages.orgId, ctx.orgId),
    ];
    // Students don't see hidden messages
    if (!isTeacherOrAdmin) {
      conditions.push(eq(chatMessages.isHidden, false));
    }

    const messages = await db.query.chatMessages.findMany({
      where: and(...conditions),
      with: { sender: { columns: { id: true, name: true, role: true } } },
      orderBy: asc(chatMessages.createdAt),
    });

    return NextResponse.json({ messages });
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST /api/chat/messages — send a message (free tier can't chat) */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const ctx = authResult;

    const body = await request.json();
    const { sessionId, content } = sendMessageSchema.parse(body);

    // Free tier students can't send chat messages
    if (ctx.role === "STUDENT") {
      const sub = await db.query.subscriptions.findFirst({
        where: and(eq(subscriptions.userId, ctx.userId), eq(subscriptions.status, "ACTIVE")),
        with: { plan: true },
      });
      if (!sub || sub.plan.tier === "FREE") {
        throw new ForbiddenError("Chat is not available on the Free plan. Upgrade to send messages.");
      }
    }

    const [message] = await db.insert(chatMessages).values({
      orgId: ctx.orgId,
      sessionId,
      senderId: ctx.userId,
      content,
    }).returning();

    // Fetch sender info for response
    const messageWithSender = await db.query.chatMessages.findFirst({
      where: eq(chatMessages.id, message.id),
      with: { sender: { columns: { id: true, name: true, role: true } } },
    });

    return NextResponse.json({ message: messageWithSender }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
