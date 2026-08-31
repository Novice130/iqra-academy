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

import { db, withHttpDb } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { teacherAvailability, users } from "@/db/schema";
import { NextResponse, NextRequest } from "next/server";
import { requireRole, ROLE_HIERARCHY, type AuthContext } from "@/lib/rbac";
import { handleApiError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { isValidZone } from "@/lib/zones";
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
    /**
     * Required, and the whole point. Without it the two times above mean
     * nothing — see the file header.
     */
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
    // Overlapping ranges on one day would generate the same slot twice, and a
    // student would see a duplicate 6:00 PM they cannot tell apart.
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

/**
 * Whose calendar is this request for?
 *
 * An admin may name a teacher. Anyone else gets their own id regardless of
 * what they asked for — without this guard, adding the parameter would let one
 * teacher rewrite another's calendar.
 */
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

      const rows = await db.query.teacherAvailability.findMany({
        where: eq(teacherAvailability.teacherId, teacherId),
      });

      // The zone is a property of the teacher, not of each row; they are
      // written together and always agree. Surface it once so the editor
      // does not have to guess from row[0].
      const timezone = rows[0]?.timezone ?? null;

      return NextResponse.json({
        teacherId,
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
  return withHttpDb(async () => {
    try {
      const authResult = await requireRole(req, ["TEACHER"]);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      // Validate BEFORE the destructive delete — a malformed body must not
      // wipe a teacher's existing availability.
      const data = bulkSlotsSchema.parse(await req.json());
      const teacherId = targetTeacherId(ctx, data.teacherId);
      const slotMinutes = data.slotMinutes ?? 30;
      const isSuper = ctx.role === "SUPER_ADMIN";
      const isSelf = teacherId === ctx.userId;

      // An admin naming a teacher must be naming one that exists in their
      // org, or the foreign key is the only thing standing between a typo
      // and a calendar attached to nobody.
      const teacher = await db.query.users.findFirst({
        where: isSuper || isSelf
          ? eq(users.id, teacherId)
          : and(eq(users.id, teacherId), eq(users.orgId, ctx.orgId)),
        columns: { id: true, orgId: true },
      });
      if (!teacher) throw new NotFoundError("Teacher");

      const targetOrgId = teacher.orgId || ctx.orgId || "org_default";

      await db.delete(teacherAvailability).where(eq(teacherAvailability.teacherId, teacherId));

      if (data.slots.length > 0) {
        await db.insert(teacherAvailability).values(
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

      return NextResponse.json({ success: true, teacherId, timezone: data.timezone });
    } catch (error) {
      return handleApiError(error);
    }
  });
}

export async function DELETE(request: NextRequest) {
  return withHttpDb(async () => {
    try {
      const authResult = await requireRole(request, ["TEACHER"]);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const { searchParams } = new URL(request.url);
      const teacherId = targetTeacherId(ctx, searchParams.get("teacherId"));

      await db.delete(teacherAvailability).where(eq(teacherAvailability.teacherId, teacherId));

      return NextResponse.json({ success: true, teacherId });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
