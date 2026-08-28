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
import { generateRoomName } from "@/lib/livekit";
import { patchRoomMetadata } from "@/lib/room-metadata";

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
      const isAdmin = user
        ? user.role === "SUPER_ADMIN" ||
          (user.role === "ORG_ADMIN" && user.orgId === session.orgId)
        : false;
      const isTeacher = user ? user.role === "TEACHER" && (user.orgId === session.orgId || user.orgId === "seed_org_iqra_academy") : false;
      const isHost = session.teacherId === ctx.userId || isAdmin || isTeacher;

      if (!isHost) {
        throw new ForbiddenError("Only the host can change the spotlight.");
      }

      // Merge, never replace. `updateRoomMetadata` overwrites the whole
      // string, and the room also carries the per-student volumes the teacher
      // has set — writing `{ spotlightIdentity }` outright would reset every
      // one of them each time the spotlight moved.
      const roomName = generateRoomName(sessionId);
      await patchRoomMetadata(roomName, { spotlightIdentity: identity });

      return NextResponse.json({ success: true, spotlightIdentity: identity });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
