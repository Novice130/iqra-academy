/**
 * @fileoverview Mark Notification Read API
 *
 * RBAC: any authenticated user (only their own notifications)
 * POST /api/notifications/[id]/read — Dismiss a notification once seen/acted on.
 */

import { NextRequest, NextResponse } from "next/server";
import { db, withDb } from "@/lib/db";
import { notifications } from "@/db/schema";
import { requireAuth } from "@/lib/rbac";
import { handleApiError, NotFoundError } from "@/lib/errors";
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

      const result = await db
        .update(notifications)
        .set({ isRead: true })
        .where(and(eq(notifications.id, id), eq(notifications.userId, ctx.userId)))
        .returning({ id: notifications.id });

      if (result.length === 0) throw new NotFoundError("Notification");

      return NextResponse.json({ success: true });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
