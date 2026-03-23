/**
 * @fileoverview Session Extension API
 *
 * RBAC: TEACHER role
 * POST /api/sessions/[id]/extend — Extend a session beyond 30 min
 *
 * Business Rule: Teacher can extend ONLY if no next class is scheduled.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { eq, and, ne, lt, gt } from "drizzle-orm";
import { sessions } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { handleApiError, NotFoundError, BusinessRuleError } from "@/lib/errors";

const extendSchema = z.object({
  additionalMinutes: z.number().int().min(5).max(30),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireRole(request, ["TEACHER"]);
    if (authResult instanceof NextResponse) return authResult;
    const ctx = authResult;
    const { id: sessionId } = await params;

    const body = await request.json();
    const { additionalMinutes } = extendSchema.parse(body);

    const session = await db.query.sessions.findFirst({
      where: and(eq(sessions.id, sessionId), eq(sessions.teacherId, ctx.userId)),
    });
    if (!session) throw new NotFoundError("Session");
    if (session.status !== "IN_PROGRESS") {
      throw new BusinessRuleError("Can only extend sessions that are in progress.");
    }

    // Check if teacher has a next class within the extension window
    const extendedEnd = new Date(session.scheduledEnd.getTime() + additionalMinutes * 60000);
    const nextSession = await db.query.sessions.findFirst({
      where: and(
        eq(sessions.teacherId, ctx.userId),
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
      .where(eq(sessions.id, sessionId))
      .returning();

    return NextResponse.json({ session: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
