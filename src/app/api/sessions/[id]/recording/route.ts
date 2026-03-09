/**
 * @fileoverview Session Recording Control API
 *
 * RBAC: TEACHER role
 * POST /api/sessions/[id]/recording — Toggle recording access for students
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { sessions } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { handleApiError, NotFoundError } from "@/lib/errors";

const recordingSchema = z.object({
  recordingUrl: z.string().url().optional(),
  /** Who can access the recording: NONE, STUDENT_ONLY, STUDENT_AND_OBSERVERS, ALL */
  access: z.enum(["NONE", "STUDENT_ONLY", "STUDENT_AND_OBSERVERS", "ALL"]),
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
    const data = recordingSchema.parse(body);

    const session = await db.query.sessions.findFirst({
      where: and(eq(sessions.id, sessionId), eq(sessions.teacherId, ctx.userId)),
    });
    if (!session) throw new NotFoundError("Session");

    const [updated] = await db
      .update(sessions)
      .set({
        ...(data.recordingUrl && { recordingUrl: data.recordingUrl }),
        recordingAccess: data.access,
      })
      .where(eq(sessions.id, sessionId))
      .returning();

    return NextResponse.json({ session: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
