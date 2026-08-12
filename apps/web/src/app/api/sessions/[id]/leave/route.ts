/**
 * @fileoverview Session Leave API — closes out an attendance row.
 *
 * RBAC: any authenticated participant, for their own attendance only.
 * POST /api/sessions/[id]/leave  { identity?: string }
 *
 * The counterpart to the join API's attendance write. This is the *fast* half
 * of a pair: it fires from `navigator.sendBeacon` as the call page is torn
 * down, so a normal leave is recorded within a second. It is not the reliable
 * half — a phone whose app is killed outright never runs it, which is what
 * the LiveKit `participant_left` webhook is for. Whichever lands first wins;
 * both only ever fill a row that is still open.
 *
 * Distinct from /end, which finishes the *class* and is host-only. Somebody
 * stepping out is not the end of the lesson.
 */

import { NextRequest, NextResponse } from "next/server";
import { withDb } from "@/lib/db";
import { requireAuth } from "@/lib/rbac";
import { handleApiError } from "@/lib/errors";
import { closeAttendanceRows } from "@/lib/attendance";

export const dynamic = "force-dynamic";

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

      // sendBeacon posts a Blob, so the body may not be JSON at all. Without
      // an identity we close every open row this user has on this session,
      // which is right for the ordinary case of one person, one connection.
      const body = await request.json().catch(() => ({} as Record<string, unknown>));
      const identity = typeof body?.identity === "string" ? body.identity : null;

      // Always scoped to the caller's own userId, identity or not: the
      // identity arrives in a request body and is not a credential.
      await closeAttendanceRows({
        sessionId,
        userId: ctx.userId,
        ...(identity ? { identity } : {}),
      });

      return NextResponse.json({ success: true });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
