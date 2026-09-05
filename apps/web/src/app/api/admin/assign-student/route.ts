/**
 * @fileoverview Admin Assign Student API
 *
 * RBAC: ORG_ADMIN, SUPER_ADMIN
 * POST /api/admin/assign-student — Assign a student profile to a teacher by scheduling classes or creating bookings.
 */

import { NextRequest, NextResponse } from "next/server";
import { db, withDb } from "@/lib/db";
import { sessions, bookings, studentProfiles, users, schedulingEvents, auditLogs, teacherTimeOff } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { handleApiError, NotFoundError, ForbiddenError, BusinessRuleError } from "@/lib/errors";
import { createId } from "@paralleldrive/cuid2";
import { and, eq, inArray, lt, gt } from "drizzle-orm";
import { assertTeacherInOrg, assertProfileInOrg } from "@/lib/session-access";
import { getClientIp } from "@/lib/audit";
import { insertSchedulingEvent } from "@/lib/realtime/outbox";
import { drainOutbox } from "@/lib/realtime/outbox-publisher";
import { afterResponse } from "@/lib/after-response";
import { z } from "zod";

const assignStudentSchema = z.object({
  studentProfileId: z.string().min(1, "studentProfileId is required"),
  teacherId: z.string().min(1, "teacherId is required"),
  title: z.string().max(120).optional(),
  track: z.enum(["QAIDAH", "QURAN_READING", "HIFZ"]).optional(),
  scheduledStart: z.string().datetime({ message: "scheduledStart must be a valid ISO 8601 datetime string" }),
  durationMinutes: z.number().int().min(15).max(180).default(30),
});

export async function POST(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireRole(request, ["ORG_ADMIN", "SUPER_ADMIN"]);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const body = await request.json().catch(() => ({}));
      const data = assignStudentSchema.parse(body);

      const isSuper = ctx.role === "SUPER_ADMIN";
      const profile = await assertProfileInOrg(data.studentProfileId, ctx.orgId, isSuper);
      const teacher = await assertTeacherInOrg(data.teacherId, ctx.orgId, isSuper);

      if (profile.orgId !== teacher.orgId) {
        throw new ForbiddenError("Student profile and teacher must belong to the same organization.");
      }

      const targetOrgId = profile.orgId;
      const startTime = new Date(data.scheduledStart);
      if (startTime.getTime() <= Date.now()) {
        throw new BusinessRuleError("Scheduled start time must be in the future.");
      }

      const endTime = new Date(startTime.getTime() + data.durationMinutes * 60 * 1000);

      // Conflict checks for teacher: existing session. Org in the WHERE
      // itself — the teacher row is org-verified, but the check must not
      // depend on that staying true through future refactors.
      const conflictingSession = await db.query.sessions.findFirst({
        where: and(
          eq(sessions.teacherId, teacher.id),
          eq(sessions.orgId, targetOrgId),
          inArray(sessions.status, ["SCHEDULED", "IN_PROGRESS"]),
          lt(sessions.scheduledStart, endTime),
          gt(sessions.scheduledEnd, startTime)
        ),
        columns: { id: true, scheduledStart: true, scheduledEnd: true },
      });

      if (conflictingSession) {
        throw new BusinessRuleError("Teacher already has a scheduled class during this time.");
      }

      // Conflict check: teacher time-off
      const conflictingTimeOff = await db.query.teacherTimeOff.findFirst({
        where: and(
          eq(teacherTimeOff.teacherId, teacher.id),
          eq(teacherTimeOff.orgId, targetOrgId),
          lt(teacherTimeOff.startsAt, endTime),
          gt(teacherTimeOff.endsAt, startTime)
        ),
        columns: { id: true },
      });

      if (conflictingTimeOff) {
        throw new BusinessRuleError("Teacher has scheduled time off during this time.");
      }

      const sessionId = createId();
      const bookingId = createId();
      const resolvedTrack = data.track || profile.track || "QAIDAH";
      const sessionTitle = data.title || `${resolvedTrack} Lesson with ${teacher.name}`;

      await db.transaction(async (tx) => {
        await tx.insert(sessions).values({
          id: sessionId,
          orgId: targetOrgId,
          teacherId: teacher.id,
          track: resolvedTrack,
          type: "INDIVIDUAL",
          origin: "SCHEDULED",
          status: "SCHEDULED",
          title: sessionTitle,
          scheduledStart: startTime,
          scheduledEnd: endTime,
          consumesQuota: true,
        });

        await tx.insert(bookings).values({
          id: bookingId,
          orgId: targetOrgId,
          userId: profile.userId,
          studentProfileId: profile.id,
          sessionId: sessionId,
          status: "CONFIRMED",
        });

        // Insert scheduling outbox events
        await insertSchedulingEvent(tx, {
          orgId: targetOrgId,
          teacherId: teacher.id,
          actorId: ctx.userId,
          type: "session.changed",
          aggregateType: "session",
          aggregateId: sessionId,
        });

        await insertSchedulingEvent(tx, {
          orgId: targetOrgId,
          teacherId: teacher.id,
          actorId: ctx.userId,
          type: "booking.created",
          aggregateType: "booking",
          aggregateId: bookingId,
        });

        // Insert audit log
        await tx.insert(auditLogs).values({
          id: createId(),
          orgId: targetOrgId,
          actorId: ctx.userId,
          action: "SESSION_CREATED",
          target: `session:${sessionId}`,
          metadata: {
            studentProfileId: profile.id,
            teacherId: teacher.id,
            bookingId,
            scheduledStart: startTime.toISOString(),
            scheduledEnd: endTime.toISOString(),
          },
          ipAddress: getClientIp(request.headers),
        });
      });

      afterResponse(drainOutbox({ orgId: targetOrgId }).catch(() => {}));

      return NextResponse.json({
        success: true,
        message: `Assigned ${profile.name} to ${teacher.name}`,
        sessionId,
        bookingId,
      });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
