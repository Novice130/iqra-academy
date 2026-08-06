/**
 * @fileoverview Decline Call API
 *
 * RBAC: callee only
 * POST /api/calls/[id]/decline — Student rejects the ring; caller's poll
 * picks up the status flip and stops ringing.
 */

import { NextRequest, NextResponse } from "next/server";
import { db, withDb } from "@/lib/db";
import { callInvites } from "@/db/schema";
import { requireAuth } from "@/lib/rbac";
import { handleApiError, NotFoundError, ForbiddenError } from "@/lib/errors";
import { and, eq } from "drizzle-orm";
import { sendCallEndedPush } from "@/lib/fcm";

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
      if (call.calleeId !== ctx.userId) throw new ForbiddenError("Not your call to decline.");

      await db
        .update(callInvites)
        .set({ status: "DECLINED", respondedAt: new Date() })
        .where(and(eq(callInvites.id, id), eq(callInvites.status, "RINGING")));

      // Declining in the browser must also stop the phone in their pocket.
      await sendCallEndedPush([call.calleeId], id);

      return NextResponse.json({ success: true });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
