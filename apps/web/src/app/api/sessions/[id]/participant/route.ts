/**
 * @fileoverview Participant Admin API
 *
 * RBAC: host only (the session's teacher, or an org/super admin)
 * POST /api/sessions/[id]/participant — rename a participant in the room.
 *
 * The display name normally comes from the JWT, which is minted once at join
 * time, so a teacher fixing "iPhone" or a mis-typed name has to be done
 * server-side through LiveKit's participant API. The change is pushed to
 * everyone in the room by LiveKit itself; nothing is written to our database
 * (renaming a participant is a per-call correction, not a profile edit).
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
      const { identity, name } = body || {};
      if (typeof identity !== "string" || typeof name !== "string") {
        throw new BusinessRuleError("identity and name are required");
      }
      const trimmed = name.trim();
      if (trimmed.length === 0 || trimmed.length > 60) {
        throw new BusinessRuleError("name must be between 1 and 60 characters");
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
        throw new ForbiddenError("Only the host can rename participants.");
      }

      const roomName = generateRoomName(sessionId);
      await getRoomServiceClient().updateParticipant(roomName, identity, { name: trimmed });

      return NextResponse.json({ success: true, name: trimmed });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
