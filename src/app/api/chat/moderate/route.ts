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
import { chatMessages } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { handleApiError, NotFoundError } from "@/lib/errors";
import { logAudit, getClientIp } from "@/lib/audit";

const moderateSchema = z.object({
  messageId: z.string().min(1),
  action: z.enum(["hide", "unhide"]),
});

/** POST /api/chat/moderate — hide or unhide a message */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ["TEACHER"]);
    if (authResult instanceof NextResponse) return authResult;
    const ctx = authResult;

    const body = await request.json();
    const { messageId, action } = moderateSchema.parse(body);

    const message = await db.query.chatMessages.findFirst({
      where: and(eq(chatMessages.id, messageId), eq(chatMessages.orgId, ctx.orgId)),
    });
    if (!message) throw new NotFoundError("Message");

    await db
      .update(chatMessages)
      .set({
        isHidden: action === "hide",
        hiddenBy: action === "hide" ? ctx.userId : null,
        hiddenAt: action === "hide" ? new Date() : null,
      })
      .where(eq(chatMessages.id, messageId));

    await logAudit({
      orgId: ctx.orgId,
      actorId: ctx.userId,
      action: "CHAT_MESSAGE_HIDDEN",
      target: `message:${messageId}`,
      metadata: { action, senderId: message.senderId },
      ipAddress: getClientIp(request.headers),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
