import { db, withRLS } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { teacherAvailability } from "@/db/schema";
import { NextResponse, NextRequest } from "next/server";
import { requireRole } from "@/lib/rbac";
import { handleApiError } from "@/lib/errors";

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ["TEACHER"]);
    if (authResult instanceof NextResponse) return authResult;
    const ctx = authResult;

    return await withRLS(ctx, async (tx) => {
      const availability = await tx.query.teacherAvailability.findMany({
        where: eq(teacherAvailability.teacherId, ctx.userId),
      });

      return NextResponse.json(availability);
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireRole(req, ["TEACHER"]);
    if (authResult instanceof NextResponse) return authResult;
    const ctx = authResult;

    const { slots } = await req.json(); // Array of { dayOfWeek: number, startTime: string, endTime: string }

    return await withRLS(ctx, async (tx) => {
      // 1. Delete existing for simplicity in this bulk update
      await tx.delete(teacherAvailability).where(eq(teacherAvailability.teacherId, ctx.userId));

      // 2. Insert new slots
      if (slots.length > 0) {
        await tx.insert(teacherAvailability).values(
          slots.map((s: any) => ({
            teacherId: ctx.userId,
            orgId: ctx.orgId,
            dayOfWeek: s.dayOfWeek,
            startTime: s.startTime,
            endTime: s.endTime,
            isRecurring: true,
          }))
        );
      }

      return NextResponse.json({ success: true });
    });
  } catch (error) {
    return handleApiError(error);
  }
}
