/**
 * @fileoverview Session Extension API
 *
 * RBAC: session host (assigned teacher, same-org ORG_ADMIN, SUPER_ADMIN)
 * POST /api/sessions/[id]/extend — Extend a session beyond 30 min
 *
 * Business Rule: Teacher can extend ONLY if no next class is scheduled.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, withDb } from "@/lib/db";
import { eq, and, ne, lt, gt } from "drizzle-orm";
import { sessions } from "@/db/schema";
import { requireAuth } from "@/lib/rbac";
import { loadOrgSession, assertSessionHost } from "@/lib/session-access";
import { handleApiError, BusinessRuleError } from "@/lib/errors";

const extendSchema = z.object({
  additionalMinutes: z.number().int().min(5).max(30),
});

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

      const body = await request.json();
      const { additionalMinutes } = extendSchema.parse(body);

      // Single host definition shared with every other session-object route:
      // assigned teacher, same-org ORG_ADMIN, or SUPER_ADMIN.
      const session = await loadOrgSession(ctx.orgId, sessionId, ctx.role);
      assertSessionHost(session, ctx);
      if (session.status !== "IN_PROGRESS") {
        throw new BusinessRuleError("Can only extend sessions that are in progress.");
      }

      // Check if teacher has a next class within the extension window
      const extendedEnd = new Date(session.scheduledEnd.getTime() + additionalMinutes * 60000);
      const nextSession = await db.query.sessions.findFirst({
        where: and(
          eq(sessions.teacherId, session.teacherId),
          eq(sessions.orgId, session.orgId),
          ne(sessions.id, sessionId),
          lt(sessions.scheduledStart, extendedEnd),
          gt(sessions.scheduledEnd, session.scheduledEnd),
          eq(sessions.status, "SCHEDULED"),
        ),
      });

      if (nextSession) {
        throw new BusinessRuleError(
          "Cannot extend — you have another class starting before the extension would end."
        );
      }

      const [updated] = await db
        .update(sessions)
        .set({
          scheduledEnd: extendedEnd,
          isExtended: true,
          extensionMin: session.extensionMin + additionalMinutes,
        })
        .where(and(eq(sessions.id, sessionId), eq(sessions.orgId, session.orgId)))
        .returning();

      return NextResponse.json({ session: updated });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
