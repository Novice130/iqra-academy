/**
 * @fileoverview Teacher Progress Records API
 *
 * RBAC: TEACHER (and above). A teacher must teach the student; an admin must
 * be in the student's org. See lib/progress.ts for both rules.
 *
 * GET  /api/teachers/progress?studentProfileId=… — latest entries for a student
 * POST /api/teachers/progress — record (or re-record) a lesson for a student,
 *      optionally with audio feedback for the linked class
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, withDb } from "@/lib/db";
import { progressRecords, teacherFeedback } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { handleApiError, BusinessRuleError } from "@/lib/errors";
import { logAudit, getClientIp } from "@/lib/audit";
import {
  assertCanRecordProgress,
  assertLessonForProfile,
  assertSessionForProfile,
  listProgressEntries,
} from "@/lib/progress";

const recordSchema = z.object({
  studentProfileId: z.string().min(1),
  lessonId: z.string().min(1),
  sessionId: z.string().min(1).optional(),
  completed: z.boolean(),
  score: z.number().int().min(1).max(100).nullable().optional(),
  notes: z.string().trim().max(1000).optional(),
  /** Audio feedback for the linked class. teacher_feedback needs a session. */
  feedbackAudioUrl: z.string().url("Audio link must be a valid URL").max(2000).optional(),
});

export async function GET(request: NextRequest) {
  return withDb(async () => {
    try {
      const ctx = await requireRole(request, ["TEACHER"]);
      if (ctx instanceof NextResponse) return ctx;

      const studentProfileId = z.string().min(1).parse(request.nextUrl.searchParams.get("studentProfileId"));
      await assertCanRecordProgress(ctx, studentProfileId);
      const entries = await listProgressEntries(studentProfileId);
      return NextResponse.json({ entries });
    } catch (error) {
      return handleApiError(error);
    }
  });
}

export async function POST(request: NextRequest) {
  return withDb(async () => {
    try {
      const ctx = await requireRole(request, ["TEACHER"]);
      if (ctx instanceof NextResponse) return ctx;

      const data = recordSchema.parse(await request.json());
      if (data.feedbackAudioUrl && !data.sessionId) {
        throw new BusinessRuleError("Audio feedback needs a class to attach to.");
      }

      const profile = await assertCanRecordProgress(ctx, data.studentProfileId);
      const lesson = await assertLessonForProfile(data.lessonId, profile);
      if (data.sessionId) await assertSessionForProfile(ctx, data.sessionId, profile);

      const now = new Date();
      // Every field the form shows is written, so re-recording a lesson
      // replaces the earlier assessment instead of half-merging with it.
      const fields = {
        sessionId: data.sessionId ?? null,
        isCompleted: data.completed,
        completedAt: data.completed ? now : null,
        // Teacher-entered by construction — this endpoint is the approval.
        teacherApproved: true,
        teacherApprovedAt: now,
        teacherApprovedBy: ctx.userId,
        teacherNotes: data.notes || null,
        score: data.score ?? null,
      };

      const { record, feedbackId } = await db.transaction(async (tx) => {
        const [record] = await tx
          .insert(progressRecords)
          .values({ studentProfileId: profile.id, lessonId: lesson.id, ...fields })
          .onConflictDoUpdate({
            target: [progressRecords.studentProfileId, progressRecords.lessonId],
            set: { ...fields, updatedAt: now },
          })
          .returning();

        let feedbackId: string | null = null;
        if (data.sessionId && data.feedbackAudioUrl) {
          const [fb] = await tx
            .insert(teacherFeedback)
            .values({
              sessionId: data.sessionId,
              teacherId: ctx.userId,
              studentProfileId: profile.id,
              audioUrl: data.feedbackAudioUrl,
              notes: data.notes || null,
            })
            .returning({ id: teacherFeedback.id });
          feedbackId = fb.id;
        }
        return { record, feedbackId };
      });

      await logAudit({
        orgId: profile.orgId,
        actorId: ctx.userId,
        action: "USER_UPDATED",
        target: `progress:${record.id}`,
        metadata: {
          op: "progress.record",
          studentProfileId: profile.id,
          lessonId: lesson.id,
          sessionId: data.sessionId ?? null,
          completed: data.completed,
          score: data.score ?? null,
          feedbackId,
        },
        ipAddress: getClientIp(request.headers),
      });

      return NextResponse.json({ record, feedbackId }, { status: 201 });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
