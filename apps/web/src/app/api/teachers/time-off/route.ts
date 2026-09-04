/**
 * @fileoverview Time off — the days a teacher is not available after all.
 *
 * RBAC: TEACHER and above; an ORG_ADMIN may act for another teacher.
 * GET    /api/teachers/time-off[?teacherId=]
 * POST   /api/teachers/time-off   { startsAt, endsAt, reason? }
 * DELETE /api/teachers/time-off?id=
 *
 * Stored as absolute instants. The editor knows the teacher's zone and
 * converts before sending, which keeps the server out of zone arithmetic and
 * makes subtracting time off from generated slots a plain comparison against
 * the same scale as sessions.scheduledStart.
 */

import { NextRequest, NextResponse } from "next/server";
import { withDb, withRLS } from "@/lib/db";
import { and, eq, gte } from "drizzle-orm";
import { teacherTimeOff } from "@/db/schema";
import { requireRole, ROLE_HIERARCHY, type AuthContext } from "@/lib/rbac";
import { handleApiError, ForbiddenError, NotFoundError, BusinessRuleError } from "@/lib/errors";
import { z } from "zod";

const createSchema = z.object({
  teacherId: z.string().min(1).optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  reason: z.string().max(200).optional(),
});

import { assertTeacherInOrg } from "@/lib/session-access";
import { insertSchedulingEvent } from "@/lib/realtime/outbox";
import { drainOutbox } from "@/lib/realtime/outbox-publisher";
import { afterResponse } from "@/lib/after-response";

function targetTeacherId(ctx: AuthContext, requested?: string | null): string {
  if (!requested || requested === ctx.userId) return ctx.userId;
  if (ROLE_HIERARCHY[ctx.role] >= ROLE_HIERARCHY.ORG_ADMIN) return requested;
  throw new ForbiddenError("You can only manage your own time off.");
}

export async function GET(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireRole(request, ["TEACHER"]);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const { searchParams } = new URL(request.url);
      const teacherId = targetTeacherId(ctx, searchParams.get("teacherId"));
      const isSuper = ctx.role === "SUPER_ADMIN";

      const teacher = await assertTeacherInOrg(teacherId, ctx.orgId, isSuper);

      return await withRLS(ctx, async (tx) => {
        // Past time off is history nobody needs on a scheduling screen.
        const rows = await tx.query.teacherTimeOff.findMany({
          where: and(
            eq(teacherTimeOff.teacherId, teacherId),
            eq(teacherTimeOff.orgId, teacher.orgId),
            gte(teacherTimeOff.endsAt, new Date())
          ),
        });
        return NextResponse.json({ timeOff: rows });
      });
    } catch (error) {
      return handleApiError(error);
    }
  });
}

export async function POST(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireRole(request, ["TEACHER"]);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const data = createSchema.parse(await request.json());
      const teacherId = targetTeacherId(ctx, data.teacherId);
      const isSuper = ctx.role === "SUPER_ADMIN";

      const teacher = await assertTeacherInOrg(teacherId, ctx.orgId, isSuper);

      const startsAt = new Date(data.startsAt);
      const endsAt = new Date(data.endsAt);
      if (endsAt <= startsAt) {
        throw new BusinessRuleError("Time off must end after it starts.");
      }

      const res = await withRLS(ctx, async (tx) => {
        const [row] = await tx
          .insert(teacherTimeOff)
          .values({ orgId: teacher.orgId, teacherId, startsAt, endsAt, reason: data.reason })
          .returning();

        await insertSchedulingEvent(tx, {
          orgId: teacher.orgId,
          teacherId,
          actorId: ctx.userId,
          type: "time_off.changed",
          aggregateType: "teacher_time_off",
          aggregateId: row.id,
        });

        return NextResponse.json({ timeOff: row }, { status: 201 });
      });

      afterResponse(drainOutbox({ orgId: teacher.orgId }).catch(() => {}));

      return res;
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

      const id = new URL(request.url).searchParams.get("id");
      if (!id) throw new BusinessRuleError("An id is required.");

      const res = await withRLS(ctx, async (tx) => {
        // Org in the WHERE itself, not checked in JS after the fact: a
        // foreign id must match zero rows, not one row plus an error.
        const existing = await tx.query.teacherTimeOff.findFirst({
          where: and(eq(teacherTimeOff.id, id), eq(teacherTimeOff.orgId, ctx.orgId)),
        });
        if (!existing) throw new NotFoundError("Time off");
        // Re-uses the same rule as the writes: your own, unless you're an admin.
        targetTeacherId(ctx, existing.teacherId);

        await tx
          .delete(teacherTimeOff)
          .where(and(eq(teacherTimeOff.id, id), eq(teacherTimeOff.orgId, ctx.orgId)));

        await insertSchedulingEvent(tx, {
          orgId: ctx.orgId,
          teacherId: existing.teacherId,
          actorId: ctx.userId,
          type: "time_off.changed",
          aggregateType: "teacher_time_off",
          aggregateId: id,
        });

        return NextResponse.json({ success: true });
      });

      afterResponse(drainOutbox({ orgId: ctx.orgId }).catch(() => {}));

      return res;
    } catch (error) {
      return handleApiError(error);
    }
  });
}
