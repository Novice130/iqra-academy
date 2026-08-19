/**
 * @fileoverview Teacher Audio Feedback API
 *
 * RBAC: TEACHER role
 * POST /api/teachers/feedback — Submit audio feedback for a student
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, withDb } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { sessions, teacherFeedback, studentProfiles } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { handleApiError, NotFoundError, ForbiddenError } from "@/lib/errors";
import { logAudit, getClientIp } from "@/lib/audit";

const feedbackSchema = z.object({
  sessionId: z.string().min(1),
  studentProfileId: z.string().min(1),
  audioUrl: z.string().url("Audio URL must be a valid URL"),
  duration: z.number().int().positive().optional(),
  notes: z.string().max(1000).optional(),
});

/** POST /api/teachers/feedback — submit audio feedback */
export async function POST(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireRole(request, ["TEACHER"]);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const body = await request.json();
      const data = feedbackSchema.parse(body);

      // Verify teacher is assigned to this session
      const session = await db.query.sessions.findFirst({
        where: and(eq(sessions.id, data.sessionId), eq(sessions.teacherId, ctx.userId)),
      });
      if (!session) throw new NotFoundError("Session");

      // The student profile must belong to the same org as the session —
      // feedback must never attach to another tenant's child.
      const profile = await db.query.studentProfiles.findFirst({
        where: and(
          eq(studentProfiles.id, data.studentProfileId),
          eq(studentProfiles.orgId, session.orgId)
        ),
      });
      if (!profile) {
        throw new ForbiddenError("The student profile is not part of this session's organization.");
      }

      const [feedback] = await db.insert(teacherFeedback).values({
        sessionId: data.sessionId,
        teacherId: ctx.userId,
        studentProfileId: data.studentProfileId,
        audioUrl: data.audioUrl,
        duration: data.duration,
        notes: data.notes,
      }).returning();

      await logAudit({
        orgId: ctx.orgId,
        actorId: ctx.userId,
        action: "SESSION_COMPLETED",
        target: `feedback:${feedback.id}`,
        metadata: { sessionId: data.sessionId, studentProfileId: data.studentProfileId },
        ipAddress: getClientIp(request.headers),
      });

      return NextResponse.json({ feedback }, { status: 201 });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
