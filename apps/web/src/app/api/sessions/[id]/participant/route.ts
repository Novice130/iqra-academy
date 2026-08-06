/**
 * @fileoverview Participant Admin API
 *
 * RBAC: host only (the session's teacher, or an org/super admin of the same org)
 * POST   /api/sessions/[id]/participant — rename a participant in the room.
 * DELETE /api/sessions/[id]/participant?identity=… — remove them from the call.
 *
 * The display name normally comes from the JWT, which is minted once at join
 * time, so a teacher fixing "iPhone" or a mis-typed name has to be done
 * server-side through LiveKit's participant API. The change is pushed to
 * everyone in the room by LiveKit itself; nothing is written to our database
 * (renaming a participant is a per-call correction, not a profile edit).
 *
 * Removal is likewise per-call: LiveKit closes that connection and the person
 * lands back where they came from. It does not un-book them from the class or
 * stop them rejoining from their dashboard — this is "leave the room now", not
 * a ban.
 */

import { NextRequest, NextResponse } from "next/server";
import { db, withDb } from "@/lib/db";
import { eq } from "drizzle-orm";
import { sessions, users } from "@/db/schema";
import { requireAuth } from "@/lib/rbac";
import { handleApiError, NotFoundError, ForbiddenError, BusinessRuleError } from "@/lib/errors";
import { generateRoomName, getRoomServiceClient } from "@/lib/livekit";

/**
 * Resolves the caller against the session, or throws. An ORG_ADMIN counts as a
 * host for their own org only — role by itself would let an admin of one org
 * reach into another org's live class.
 */
async function assertHost(request: NextRequest, sessionId: string) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return { response: authResult };
  const ctx = authResult;

  const session = await db.query.sessions.findFirst({
    where: eq(sessions.id, sessionId),
  });
  if (!session) throw new NotFoundError("Session");

  const user = await db.query.users.findFirst({ where: eq(users.id, ctx.userId) });
  const isAdmin = user
    ? user.role === "SUPER_ADMIN" || (user.role === "ORG_ADMIN" && user.orgId === session.orgId)
    : false;
  if (session.teacherId !== ctx.userId && !isAdmin) {
    throw new ForbiddenError("Only the host can manage participants.");
  }
  return { session, ctx };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withDb(async () => {
    try {
      const { id: sessionId } = await params;
      const guard = await assertHost(request, sessionId);
      if ("response" in guard) return guard.response;

      const body = await request.json().catch(() => ({}));
      const { identity, name } = body || {};
      if (typeof identity !== "string" || typeof name !== "string") {
        throw new BusinessRuleError("identity and name are required");
      }
      const trimmed = name.trim();
      if (trimmed.length === 0 || trimmed.length > 60) {
        throw new BusinessRuleError("name must be between 1 and 60 characters");
      }

      const roomName = generateRoomName(sessionId);
      await getRoomServiceClient().updateParticipant(roomName, identity, { name: trimmed });

      return NextResponse.json({ success: true, name: trimmed });
    } catch (error) {
      return handleApiError(error);
    }
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withDb(async () => {
    try {
      const { id: sessionId } = await params;
      const guard = await assertHost(request, sessionId);
      if ("response" in guard) return guard.response;

      const identity = new URL(request.url).searchParams.get("identity");
      if (!identity) throw new BusinessRuleError("identity is required");

      // Removal is per-connection: the identity carries a `#suffix` so the
      // host removes the phone that joined twice, not the person's laptop too.
      const roomName = generateRoomName(sessionId);
      await getRoomServiceClient().removeParticipant(roomName, identity);

      return NextResponse.json({ success: true });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
