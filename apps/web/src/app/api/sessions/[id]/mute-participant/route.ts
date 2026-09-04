/**
 * @fileoverview Mute Participant API
 *
 * RBAC: host only (session owner or org admin)
 * POST /api/sessions/[id]/mute-participant — Force-mutes a participant's
 * published track. LiveKit intentionally does not support a server-forced
 * unmute (a server shouldn't be able to secretly turn on someone's mic) —
 * unmuting has to be requested from the client and accepted by that
 * participant themselves.
 */

import { NextRequest, NextResponse } from "next/server";
import { db, withDb } from "@/lib/db";
import { eq } from "drizzle-orm";
import { sessions, users } from "@/db/schema";
import { requireAuth } from "@/lib/rbac";
import { handleApiError, NotFoundError, ForbiddenError, BusinessRuleError } from "@/lib/errors";
import { generateRoomName, getRoomServiceClient } from "@/lib/livekit";
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
      const { identity, trackSid, muted } = body || {};
      if (typeof identity !== "string" || typeof trackSid !== "string" || typeof muted !== "boolean") {
        throw new BusinessRuleError("identity, trackSid, and muted are required");
      }
      if (!muted) {
        throw new BusinessRuleError("Server-forced unmute isn't supported — request it from the client instead.");
      }

      const session = await loadOrgSession(ctx.orgId, sessionId, ctx.role);
      assertSessionHost(session, ctx);

      const roomName = generateRoomName(sessionId);
      await getRoomServiceClient().mutePublishedTrack(roomName, identity, trackSid, true);

      return NextResponse.json({ success: true });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
