/**
 * @fileoverview Unread Notifications API
 *
 * RBAC: any authenticated user
 * GET /api/notifications/unread — Poll for this user's unread notifications
 * (e.g. "your teacher started a meeting"). No push transport exists yet,
 * so the dashboard polls this on an interval.
 */

import { NextRequest, NextResponse } from "next/server";
import { db, withHttpDb } from "@/lib/db";
import { notifications, sessions } from "@/db/schema";
import { requireAuth } from "@/lib/rbac";
import { handleApiError } from "@/lib/errors";
import { and, desc, eq, inArray } from "drizzle-orm";

export async function GET(request: NextRequest) {
  return withHttpDb(async () => {
    try {
      const authResult = await requireAuth(request);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const unread = await db.query.notifications.findMany({
        where: and(eq(notifications.userId, ctx.userId), eq(notifications.isRead, false)),
        orderBy: [desc(notifications.createdAt)],
        limit: 20,
      });

      // Filter out stale MEETING_STARTED notifications
      const validNotifs = [];
      const staleNotifIds: string[] = [];
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

      for (const n of unread) {
        if (n.type === "MEETING_STARTED") {
          if (n.createdAt < twoHoursAgo || !n.sessionId) {
            staleNotifIds.push(n.id);
            continue;
          }
          const sess = await db.query.sessions.findFirst({
            where: and(eq(sessions.id, n.sessionId), eq(sessions.status, "IN_PROGRESS")),
          });
          if (!sess) {
            staleNotifIds.push(n.id);
            continue;
          }
        }
        validNotifs.push(n);
      }

      if (staleNotifIds.length > 0) {
        try {
          await db
            .update(notifications)
            .set({ isRead: true })
            .where(inArray(notifications.id, staleNotifIds));
        } catch {
          // Non-fatal
        }
      }

      return NextResponse.json({ notifications: validNotifs });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
