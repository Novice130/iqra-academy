/**
 * @fileoverview Session Spotlight API
 *
 * RBAC: host only (session owner or org admin)
 * POST /api/sessions/[id]/spotlight — Sets which participant (by LiveKit
 * identity) is pinned to the main view for every participant in the call.
 * Pass identity: null to clear the spotlight and return to grid view.
 */

import { NextRequest, NextResponse } from "next/server";
import { db, withDb } from "@/lib/db";
import { eq } from "drizzle-orm";
import { sessions, users } from "@/db/schema";
import { requireAuth } from "@/lib/rbac";
import { handleApiError, NotFoundError, ForbiddenError, BusinessRuleError } from "@/lib/errors";
import { generateRoomName, getRoomServiceClient } from "@/lib/livekit";

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

      const body = await request.json().catch(() => ({}));
      const identity = body?.identity;
      if (identity !== null && typeof identity !== "string") {
        throw new BusinessRuleError("identity must be a string or null");
      }

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
        throw new ForbiddenError("Only the host can change the spotlight.");
      }

      const roomName = generateRoomName(sessionId);
      await getRoomServiceClient().updateRoomMetadata(
        roomName,
        JSON.stringify({ spotlightIdentity: identity })
      );

      return NextResponse.json({ success: true, spotlightIdentity: identity });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
