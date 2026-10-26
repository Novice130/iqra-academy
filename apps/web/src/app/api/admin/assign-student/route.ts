/**
 * @fileoverview Admin Assign Student API
 *
 * RBAC: ORG_ADMIN, SUPER_ADMIN
 * POST /api/admin/assign-student — book a student profile with a teacher,
 * once or weekly for up to 12 weeks.
 *
 * Body:
 *   studentProfileId, teacherId   required; must share an org. An ORG_ADMIN
 *                                 may only use their own org's; a SUPER_ADMIN
 *                                 may book in any org, but never across two.
 *   date + time + timeZone        the wall clock the admin typed
 *                                 ("2026-11-02", "17:30", "America/Chicago")
 *   scheduledStart                or an ISO instant (older callers)
 *   durationMinutes               15–180, default 30
 *   repeatWeeks                   1–12, default 1
 *   track, title                  optional
 *
 * Weekly repeats step the *wall clock* a week at a time in the zone it was
 * typed in, so a 5:30 PM class stays at 5:30 PM across a DST change instead
 * of drifting an hour. Each week gets the same checks as a single booking —
 * in the future, teacher free, no time off, student free — and a week that
 * fails is skipped rather than sinking the rest. The response says which
 * weeks were booked and why any were not.
 */

import { NextRequest, NextResponse } from "next/server";
import { db, withDb } from "@/lib/db";
import { sessions, bookings } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { handleApiError, ForbiddenError, AppError } from "@/lib/errors";
import { createId } from "@paralleldrive/cuid2";
import { assertTeacherInOrg, assertProfileInOrg } from "@/lib/session-access";
import { getClientIp, logAuditBatch } from "@/lib/audit";
import { insertSchedulingEvent } from "@/lib/realtime/outbox";
import { drainOutbox } from "@/lib/realtime/outbox-publisher";
import { afterResponse } from "@/lib/after-response";
import { addDaysToDateKey, findScheduleConflict, lockTeacherSchedules, wallClockToInstant } from "@/lib/admin-scheduling";
import { z } from "zod";

const assignStudentSchema = z
  .object({
    studentProfileId: z.string().min(1, "studentProfileId is required"),
    teacherId: z.string().min(1, "teacherId is required"),
    title: z.string().max(120).optional(),
    track: z.enum(["QAIDAH", "QURAN_READING", "HIFZ"]).optional(),
    scheduledStart: z.string().datetime({ message: "scheduledStart must be a valid ISO 8601 datetime string" }).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD").optional(),
    time: z.string().regex(/^\d{2}:\d{2}$/, "time must be HH:mm").optional(),
    timeZone: z.string().min(1).max(64).optional(),
    durationMinutes: z.number().int().min(15).max(180).default(30),
    repeatWeeks: z.number().int().min(1).max(12).default(1),
  })
  .refine((d) => d.scheduledStart || (d.date && d.time && d.timeZone), {
    message: "Give scheduledStart, or date, time and timeZone.",
    path: ["scheduledStart"],
  });

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

interface Occurrence {
  /** Calendar date as typed (or the UTC date for an ISO start). */
  date: string;
  start: Date | null;
  /** Set when the wall-clock time does not exist that week. */
  invalid?: string;
}

export async function POST(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireRole(request, ["ORG_ADMIN"]);
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

      const occurrences: Occurrence[] = [];
      for (let i = 0; i < data.repeatWeeks; i++) {
        if (data.date && data.time && data.timeZone) {
          const date = addDaysToDateKey(data.date, i * 7);
          try {
            occurrences.push({ date, start: wallClockToInstant(date, data.time, data.timeZone) });
          } catch (error) {
            // A bad zone or format is wrong for every week — refuse outright.
            // A missing hour (DST) is one week's problem.
            if (i === 0 && error instanceof AppError && error.statusCode === 400) throw error;
            occurrences.push({ date, start: null, invalid: error instanceof Error ? error.message : "Invalid time." });
          }
        } else {
          const start = new Date(new Date(data.scheduledStart!).getTime() + i * WEEK_MS);
          occurrences.push({ date: start.toISOString().slice(0, 10), start });
        }
      }

      const resolvedTrack = data.track || profile.track || "QAIDAH";
      const sessionTitle = data.title?.trim() || `${resolvedTrack} Lesson with ${teacher.name}`;
      const seriesId = data.repeatWeeks > 1 ? createId() : null;

      const created: { date: string; scheduledStart: string; sessionId: string; bookingId: string }[] = [];
      const skipped: { date: string; scheduledStart: string | null; reason: string }[] = [];

      await db.transaction(async (tx) => {
        // Held to commit: a second request for this teacher waits here, then
        // sees these weeks in its own conflict checks instead of double-booking.
        await lockTeacherSchedules(tx, [teacher.id]);
        for (const occ of occurrences) {
          if (!occ.start) {
            skipped.push({ date: occ.date, scheduledStart: null, reason: occ.invalid ?? "Invalid time." });
            continue;
          }
          const startTime = occ.start;
          const endTime = new Date(startTime.getTime() + data.durationMinutes * 60 * 1000);

          if (startTime.getTime() <= Date.now()) {
            skipped.push({ date: occ.date, scheduledStart: startTime.toISOString(), reason: "Scheduled start time must be in the future." });
            continue;
          }
          // Checked inside the transaction so each week also sees the weeks
          // this request has already booked.
          const conflict = await findScheduleConflict(tx, {
            orgId: targetOrgId,
            teacherId: teacher.id,
            start: startTime,
            end: endTime,
            studentProfileIds: [profile.id],
          });
          if (conflict) {
            skipped.push({ date: occ.date, scheduledStart: startTime.toISOString(), reason: conflict });
            continue;
          }

          const sessionId = createId();
          const bookingId = createId();
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
            sessionId,
            status: "CONFIRMED",
          });
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
          created.push({ date: occ.date, scheduledStart: startTime.toISOString(), sessionId, bookingId });
        }
      });

      if (created.length === 0) {
        // One class asked for and refused reads best as that reason alone.
        const error =
          occurrences.length === 1
            ? skipped[0]?.reason ?? "The class could not be booked."
            : `None of the ${occurrences.length} weekly classes could be booked. First problem: ${skipped[0]?.reason}`;
        return NextResponse.json({ error, created, skipped }, { status: 422 });
      }

      const ip = getClientIp(request.headers);
      await logAuditBatch(
        created.map((c) => ({
          orgId: targetOrgId,
          actorId: ctx.userId,
          action: "SESSION_CREATED" as const,
          target: `session:${c.sessionId}`,
          metadata: {
            op: "session.create",
            studentProfileId: profile.id,
            teacherId: teacher.id,
            bookingId: c.bookingId,
            scheduledStart: c.scheduledStart,
            durationMinutes: data.durationMinutes,
            ...(seriesId && { seriesId, repeatWeeks: data.repeatWeeks }),
          },
          ipAddress: ip,
        }))
      );

      afterResponse(drainOutbox({ orgId: targetOrgId }).catch(() => {}));

      return NextResponse.json({
        success: true,
        message:
          created.length === 1
            ? `Assigned ${profile.name} to ${teacher.name}`
            : `Booked ${created.length} weekly classes for ${profile.name} with ${teacher.name}`,
        // The first booked class — older callers read these two.
        sessionId: created[0].sessionId,
        bookingId: created[0].bookingId,
        created,
        skipped,
      });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
