/**
 * @fileoverview Accept Call API
 *
 * RBAC: callee only
 * POST /api/calls/[id]/accept — Student answers the ring. The caller's poll
 * picks up the status flip and navigates them into the session; the callee
 * navigates client-side right after this call succeeds.
 */

import { NextRequest, NextResponse } from "next/server";
import { db, withDb } from "@/lib/db";
import { callInvites } from "@/db/schema";
import { requireAuth } from "@/lib/rbac";
import { handleApiError, NotFoundError, ForbiddenError, ConflictError } from "@/lib/errors";
import { and, eq } from "drizzle-orm";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withDb(async () => {
    try {
      const authResult = await requireAuth(request);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;
      const { id } = await params;

      const call = await db.query.callInvites.findFirst({ where: eq(callInvites.id, id) });
      if (!call) throw new NotFoundError("Call");
      if (call.calleeId !== ctx.userId) throw new ForbiddenError("Not your call to answer.");

      const result = await db
        .update(callInvites)
        .set({ status: "ACCEPTED", respondedAt: new Date() })
        .where(and(eq(callInvites.id, id), eq(callInvites.status, "RINGING")))
        .returning({ id: callInvites.id, sessionId: callInvites.sessionId });

      if (result.length === 0) throw new ConflictError("This call is no longer ringing.");

      return NextResponse.json({ success: true, sessionId: result[0].sessionId });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
