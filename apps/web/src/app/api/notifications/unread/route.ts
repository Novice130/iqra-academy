/**
 * @fileoverview Unread Notifications API
 *
 * RBAC: any authenticated user
 * GET /api/notifications/unread — Poll for this user's unread notifications
 * (e.g. "your teacher started a meeting"). No push transport exists yet,
 * so the dashboard polls this on an interval.
 */

import { NextRequest, NextResponse } from "next/server";
import { db, withDb } from "@/lib/db";
import { notifications } from "@/db/schema";
import { requireAuth } from "@/lib/rbac";
import { handleApiError } from "@/lib/errors";
import { and, desc, eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireAuth(request);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const unread = await db.query.notifications.findMany({
        where: and(eq(notifications.userId, ctx.userId), eq(notifications.isRead, false)),
        orderBy: [desc(notifications.createdAt)],
        limit: 20,
      });

      return NextResponse.json({ notifications: unread });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
