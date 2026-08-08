/**
 * @fileoverview Call Status Poll API
 *
 * RBAC: caller or callee only
 * GET /api/calls/[id] — Caller polls this to know the moment the callee
 * accepts/declines (fast interval, this is the "ringing" UX).
 */

import { NextRequest, NextResponse } from "next/server";
import { db, withHttpDb } from "@/lib/db";
import { callInvites } from "@/db/schema";
import { requireAuth } from "@/lib/rbac";
import { handleApiError, NotFoundError, ForbiddenError } from "@/lib/errors";
import { eq } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withHttpDb(async () => {
    try {
      const authResult = await requireAuth(request);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;
      const { id } = await params;

      const call = await db.query.callInvites.findFirst({
        where: eq(callInvites.id, id),
      });
      if (!call) throw new NotFoundError("Call");
      if (call.callerId !== ctx.userId && call.calleeId !== ctx.userId) {
        throw new ForbiddenError("Not part of this call.");
      }

      return NextResponse.json({
        id: call.id,
        status: call.status,
        sessionId: call.sessionId,
      });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
