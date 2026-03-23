/**
 * @fileoverview Chat Moderation API
 *
 * RBAC: TEACHER or ORG_ADMIN
 * POST /api/chat/moderate — Hide a chat message
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { chatMessages, chatModerationActions } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { handleApiError, NotFoundError } from "@/lib/errors";
import { logAudit, getClientIp } from "@/lib/audit";

const moderateSchema = z.object({
  messageId: z.string().min(1),
  action: z.enum(["hide", "unhide", "delete"]),
  reason: z.string().max(500).optional(),
});

/** POST /api/chat/moderate — hide or unhide a message */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ["TEACHER"]);
    if (authResult instanceof NextResponse) return authResult;
    const ctx = authResult;

    const body = await request.json();
    const { messageId, action, reason } = moderateSchema.parse(body);

    const message = await db.query.chatMessages.findFirst({
      where: and(eq(chatMessages.id, messageId), eq(chatMessages.orgId, ctx.orgId)),
    });
    if (!message) throw new NotFoundError("Message");

    await db
      .update(chatMessages)
      .set({
        isHidden: action === "hide",
        isDeleted: action === "delete",
      })
      .where(eq(chatMessages.id, messageId));

    // Log the moderation action in a separate audit table
    await db.insert(chatModerationActions).values({
      orgId: ctx.orgId,
      messageId,
      moderatorId: ctx.userId,
      action: action.toUpperCase(),
      reason: reason || null,
    });

    await logAudit({
      orgId: ctx.orgId,
      actorId: ctx.userId,
      action: action === "delete" ? "CHAT_MESSAGE_DELETED" : "CHAT_MESSAGE_HIDDEN",
      target: `message:${messageId}`,
      metadata: { action, senderId: message.senderId, reason },
      ipAddress: getClientIp(request.headers),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
