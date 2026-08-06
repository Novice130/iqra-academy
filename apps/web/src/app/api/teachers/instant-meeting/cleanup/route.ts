/**
 * @fileoverview Instant Meeting Cleanup API
 *
 * RBAC: TEACHER, ORG_ADMIN, SUPER_ADMIN
 * POST /api/teachers/instant-meeting/cleanup — Bulk-deletes instant meeting
 * sessions. Teachers clean up only their own; admins clean up the whole org.
 */

import { NextRequest, NextResponse } from "next/server";
import { db, withDb } from "@/lib/db";
import { and, eq, like } from "drizzle-orm";
import { sessions } from "@/db/schema";
import { deleteSessionCascade } from "@/lib/session-cleanup";
import { requireRole } from "@/lib/rbac";
import { handleApiError } from "@/lib/errors";

export async function POST(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireRole(request, ["TEACHER", "ORG_ADMIN", "SUPER_ADMIN"]);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const isAdmin = ["ORG_ADMIN", "SUPER_ADMIN"].includes(ctx.role);

      const target = isAdmin
        ? and(eq(sessions.orgId, ctx.orgId), like(sessions.title, "Instant Meeting%"))
        : and(eq(sessions.teacherId, ctx.userId), like(sessions.title, "Instant Meeting%"));

      const toDelete = await db.query.sessions.findMany({
        where: target,
        columns: { id: true },
      });

      let deletedCount = 0;

      await db.transaction(async (tx) => {
        for (const { id: sessionId } of toDelete) {
          await deleteSessionCascade(tx as never, sessionId);
          deletedCount++;
        }
      });

      return NextResponse.json({ success: true, deletedCount });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
