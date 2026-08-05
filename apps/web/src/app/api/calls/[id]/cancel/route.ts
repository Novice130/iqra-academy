/**
 * @fileoverview Cancel Call API
 *
 * RBAC: caller only
 * POST /api/calls/[id]/cancel — Teacher gave up waiting (no answer) or hung
 * up before the student responded; callee's poll picks up the status flip
 * and dismisses the ring UI.
 */

import { NextRequest, NextResponse } from "next/server";
import { db, withDb } from "@/lib/db";
import { callInvites } from "@/db/schema";
import { requireAuth } from "@/lib/rbac";
import { handleApiError, NotFoundError, ForbiddenError } from "@/lib/errors";
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
      if (call.callerId !== ctx.userId) throw new ForbiddenError("Not your call to cancel.");

      await db
        .update(callInvites)
        .set({ status: "EXPIRED", respondedAt: new Date() })
        .where(and(eq(callInvites.id, id), eq(callInvites.status, "RINGING")));

      return NextResponse.json({ success: true });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
