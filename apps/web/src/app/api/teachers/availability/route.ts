/**
 * @fileoverview Teacher availability — the weekly hours a teacher offers.
 *
 * RBAC: TEACHER and above. An ORG_ADMIN may act on another teacher's calendar
 * by passing `teacherId`; a TEACHER may only ever touch their own.
 *
 * GET  /api/teachers/availability[?teacherId=] — the teacher's weekly ranges
 * POST /api/teachers/availability             — replace them wholesale
 *
 * ── The bug this file used to have ──────────────────────────────────────────
 * The insert never set `timezone`, and the column defaulted to
 * 'America/New_York'. Every row therefore claimed Eastern time while the
 * teacher entering it sat in Asia/Kolkata: not unlabelled, but labelled
 * wrongly, which is worse because it looks like an answer. The zone is now
 * required in the request and the DB default is gone, so an omission is a
 * loud failure rather than a quiet lie.
 *
 * It also inserted an `isRecurring` column that does not exist. Drizzle drops
 * unknown keys silently, so it did nothing at all — removed.
 *
 * ── Ranges, not cells ───────────────────────────────────────────────────────
 * A row is a range ("Monday 16:00-20:00"), sliced into bookable slots at
 * generation time by lib/slots.ts. One row per 30-minute cell would be 28 rows
 * per teacher per day and would turn every granularity change into a data
 * migration.
 *
 * ── HH:MM in both directions ────────────────────────────────────────────────
 * Postgres hands back a `time` column as "08:00:00" while the editor speaks
 * "08:00", so saved availability never rendered as selected. Normalising here
 * means the API has one format; fixing it in the UI would only have moved the
 * bug to the next caller.
 */

import { db, withDb, withHttpDb } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { teacherAvailability, users, notifications } from "@/db/schema";
import { NextResponse, NextRequest } from "next/server";
import { requireRole, ROLE_HIERARCHY, type AuthContext } from "@/lib/rbac";
import { handleApiError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { isValidZone } from "@/lib/zones";
import { assertTeacherInOrg } from "@/lib/session-access";
import { insertSchedulingEvent } from "@/lib/realtime/outbox";
import { drainOutbox } from "@/lib/realtime/outbox-publisher";
import { afterResponse } from "@/lib/after-response";
import { z } from "zod";

/** "08:00:00", "08:00", and "24:00" (end of day) */
const HHMM = /^(24:00(:00)?|([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?)$/;
const toHHMM = (t: string) => t.slice(0, 5);
const minutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

const slotSchema = z.object({
  dayOfWeek: z.enum([
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY",
    "SUNDAY",
  ]),
  startTime: z.string().regex(HHMM, "startTime must be HH:MM"),
  endTime: z.string().regex(HHMM, "endTime must be HH:MM"),
});

const bulkSlotsSchema = z
  .object({
    timezone: z.string().refine(isValidZone, "Unknown time zone"),
    slotMinutes: z.number().int().min(15).max(120).optional(),
    teacherId: z.string().min(1).optional(),
    slots: z.array(slotSchema).max(100),
  })
  .superRefine((data, ctx) => {
    for (const [i, s] of data.slots.entries()) {
      if (minutes(s.endTime) <= minutes(s.startTime)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["slots", i],
          message: `${s.dayOfWeek} ${s.startTime}-${s.endTime} ends before it starts.`,
        });
      }
    }
    const byDay = new Map<string, typeof data.slots>();
    for (const s of data.slots) {
      const list = byDay.get(s.dayOfWeek) ?? [];
      list.push(s);
      byDay.set(s.dayOfWeek, list);
    }
    for (const [day, list] of byDay) {
      const sorted = [...list].sort((a, b) => minutes(a.startTime) - minutes(b.startTime));
      for (let i = 1; i < sorted.length; i++) {
        if (minutes(sorted[i].startTime) < minutes(sorted[i - 1].endTime)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["slots"],
            message: `${day} has overlapping ranges.`,
          });
          break;
        }
      }
    }
  });

function targetTeacherId(ctx: AuthContext, requested?: string | null): string {
  if (!requested || requested === ctx.userId) return ctx.userId;
  if (ROLE_HIERARCHY[ctx.role] >= ROLE_HIERARCHY.ORG_ADMIN) return requested;
  throw new ForbiddenError("You can only manage your own availability.");
}

export async function GET(request: NextRequest) {
  return withHttpDb(async () => {
    try {
      const authResult = await requireRole(request, ["TEACHER"]);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const { searchParams } = new URL(request.url);
      const teacherId = targetTeacherId(ctx, searchParams.get("teacherId"));
      const isSuper = ctx.role === "SUPER_ADMIN";

      const teacher = await assertTeacherInOrg(teacherId, ctx.orgId, isSuper);

      const rows = await db.query.teacherAvailability.findMany({
        where: and(
          eq(teacherAvailability.teacherId, teacherId),
          eq(teacherAvailability.orgId, teacher.orgId)
        ),
      });

      const timezone = rows[0]?.timezone ?? null;

      return NextResponse.json({
        teacherId,
        teacherName: teacher.name || teacher.email,
        timezone,
        slotMinutes: rows[0]?.slotMinutes ?? 30,
        slots: rows.map((r) => ({
          id: r.id,
          dayOfWeek: r.dayOfWeek,
          startTime: toHHMM(r.startTime),
          endTime: toHHMM(r.endTime),
          isActive: r.isActive,
        })),
      });
    } catch (error) {
      return handleApiError(error);
    }
  });
}

export async function POST(req: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireRole(req, ["TEACHER"]);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const data = bulkSlotsSchema.parse(await req.json());
      const teacherId = targetTeacherId(ctx, data.teacherId);
      const slotMinutes = data.slotMinutes ?? 30;
      const isSuper = ctx.role === "SUPER_ADMIN";

      const teacher = await assertTeacherInOrg(teacherId, ctx.orgId, isSuper);
      const targetOrgId = teacher.orgId;
      const isExternalEdit = ctx.userId !== teacherId;

      let previousSlots: typeof teacherAvailability.$inferSelect[] = [];
      let actorName = "An administrator";

      if (isExternalEdit) {
        previousSlots = await db.query.teacherAvailability.findMany({
          where: and(
            eq(teacherAvailability.teacherId, teacherId),
            eq(teacherAvailability.orgId, targetOrgId)
          ),
        });
        const actor = await db.query.users.findFirst({
          where: eq(users.id, ctx.userId),
          columns: { name: true },
        });
        if (actor?.name) actorName = actor.name;
      }

      await db.transaction(async (tx) => {
        await tx
          .delete(teacherAvailability)
          .where(
            and(
              eq(teacherAvailability.teacherId, teacherId),
              eq(teacherAvailability.orgId, targetOrgId)
            )
          );

        if (data.slots.length > 0) {
          await tx.insert(teacherAvailability).values(
            data.slots.map((s) => ({
              teacherId,
              orgId: targetOrgId,
              dayOfWeek: s.dayOfWeek,
              startTime: s.startTime,
              endTime: s.endTime,
              timezone: data.timezone,
              slotMinutes,
            }))
          );
        }

        if (isExternalEdit) {
          await tx.insert(notifications).values({
            orgId: targetOrgId,
            userId: teacherId,
            type: "AVAILABILITY_CHANGED",
            message: `${actorName} updated your weekly availability schedule.`,
            payload: {
              actorName,
              teacherId,
              before: previousSlots.map((s) => ({
                dayOfWeek: s.dayOfWeek,
                startTime: toHHMM(s.startTime),
                endTime: toHHMM(s.endTime),
                timezone: s.timezone,
              })),
              after: data.slots.map((s) => ({
                dayOfWeek: s.dayOfWeek,
                startTime: s.startTime,
                endTime: s.endTime,
                timezone: data.timezone,
              })),
              changedAt: new Date().toISOString(),
            },
          });
        }

        await insertSchedulingEvent(tx, {
          orgId: targetOrgId,
          teacherId,
          actorId: ctx.userId,
          type: "availability.changed",
          aggregateType: "teacher_availability",
          aggregateId: teacherId,
        });
      });

      afterResponse(drainOutbox({ orgId: targetOrgId }).catch(() => {}));

      return NextResponse.json({ success: true, teacherId, timezone: data.timezone });
    } catch (error) {
      return handleApiError(error);
    }
  });
}

export async function DELETE(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireRole(request, ["TEACHER"]);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const { searchParams } = new URL(request.url);
      const teacherId = targetTeacherId(ctx, searchParams.get("teacherId"));
      const isSuper = ctx.role === "SUPER_ADMIN";

      const teacher = await assertTeacherInOrg(teacherId, ctx.orgId, isSuper);
      const isExternalEdit = ctx.userId !== teacherId;

      // A full wipe is the most extreme edit: capture before-state so the
      // teacher's notification can show what vanished, same as POST.
      const previousSlots = isExternalEdit
        ? await db.query.teacherAvailability.findMany({
            where: and(
              eq(teacherAvailability.teacherId, teacherId),
              eq(teacherAvailability.orgId, teacher.orgId)
            ),
          })
        : [];

      await db.transaction(async (tx) => {
        await tx
          .delete(teacherAvailability)
          .where(
            and(
              eq(teacherAvailability.teacherId, teacherId),
              eq(teacherAvailability.orgId, teacher.orgId)
            )
          );

        if (isExternalEdit) {
          let actorName = "An administrator";
          const actor = await tx.query.users.findFirst({
            where: eq(users.id, ctx.userId),
            columns: { name: true },
          });
          if (actor?.name) actorName = actor.name;
          await tx.insert(notifications).values({
            orgId: teacher.orgId,
            userId: teacherId,
            type: "AVAILABILITY_CHANGED",
            message: `${actorName} cleared your weekly availability schedule.`,
            payload: {
              actorName,
              teacherId,
              before: previousSlots.map((r) => ({
                dayOfWeek: r.dayOfWeek,
                startTime: toHHMM(r.startTime),
                endTime: toHHMM(r.endTime),
                timezone: r.timezone,
              })),
              after: [],
              changedAt: new Date().toISOString(),
            },
          });
        }

        await insertSchedulingEvent(tx, {
          orgId: teacher.orgId,
          teacherId,
          actorId: ctx.userId,
          type: "availability.changed",
          aggregateType: "teacher_availability",
          aggregateId: teacherId,
        });
      });

      afterResponse(drainOutbox({ orgId: teacher.orgId }).catch(() => {}));

      return NextResponse.json({ success: true, teacherId });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
