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
import { loadOrgSession, assertSessionHost } from "@/lib/session-access";

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

      const session = await loadOrgSession(ctx.orgId, sessionId, ctx.role);
      assertSessionHost(session, ctx);

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
