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

      return await withRLS(ctx, async (tx) => {
        // Past time off is history nobody needs on a scheduling screen.
        const rows = await tx.query.teacherTimeOff.findMany({
          where: and(
            eq(teacherTimeOff.teacherId, teacherId),
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
      const startsAt = new Date(data.startsAt);
      const endsAt = new Date(data.endsAt);
      if (endsAt <= startsAt) {
        throw new BusinessRuleError("Time off must end after it starts.");
      }

      return await withRLS(ctx, async (tx) => {
        const [row] = await tx
          .insert(teacherTimeOff)
          .values({ orgId: ctx.orgId, teacherId, startsAt, endsAt, reason: data.reason })
          .returning();
        return NextResponse.json({ timeOff: row }, { status: 201 });
      });
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

      return await withRLS(ctx, async (tx) => {
        const existing = await tx.query.teacherTimeOff.findFirst({
          where: eq(teacherTimeOff.id, id),
        });
        if (!existing || existing.orgId !== ctx.orgId) throw new NotFoundError("Time off");
        // Re-uses the same rule as the writes: your own, unless you're an admin.
        targetTeacherId(ctx, existing.teacherId);

        await tx.delete(teacherTimeOff).where(eq(teacherTimeOff.id, id));
        return NextResponse.json({ success: true });
      });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
