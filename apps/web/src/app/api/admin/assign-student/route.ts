/**
 * @fileoverview Admin Assign Student API
 *
 * RBAC: ORG_ADMIN, SUPER_ADMIN
 * POST /api/admin/assign-student — Assign a student profile to a teacher by scheduling classes or creating bookings.
 */

import { NextRequest, NextResponse } from "next/server";
import { db, withDb } from "@/lib/db";
import { sessions, bookings, studentProfiles, users } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { handleApiError, NotFoundError, ForbiddenError } from "@/lib/errors";
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireRole(request, ["ORG_ADMIN", "SUPER_ADMIN"]);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const body = await request.json();
      const { studentProfileId, teacherId, title, track, scheduledStart, durationMinutes = 30 } = body;

      if (!studentProfileId || !teacherId) {
        return NextResponse.json(
          { success: false, error: "studentProfileId and teacherId are required" },
          { status: 400 }
        );
      }

      const profile = await db.query.studentProfiles.findFirst({
        where: eq(studentProfiles.id, studentProfileId),
      });
      if (!profile) throw new NotFoundError("Student Profile");

      const teacher = await db.query.users.findFirst({
        where: eq(users.id, teacherId),
      });
      if (!teacher) throw new NotFoundError("Teacher");

      const isSuper = ctx.role === "SUPER_ADMIN";
      const targetOrgId = profile.orgId || teacher.orgId || ctx.orgId || "org_default";

      if (!isSuper && ctx.orgId && profile.orgId && profile.orgId !== ctx.orgId) {
        throw new ForbiddenError("You can only assign students and teachers from your own organization.");
      }

      const sessionId = createId();
      const startTime = scheduledStart ? new Date(scheduledStart) : new Date(Date.now() + 24 * 60 * 60 * 1000);
      const dur = Number(durationMinutes) || 30;
      const endTime = new Date(startTime.getTime() + dur * 60 * 1000);

      await db.insert(sessions).values({
        id: sessionId,
        orgId: targetOrgId,
        teacherId: teacher.id,
        track: track || profile.track || "QAIDAH",
        type: "INDIVIDUAL",
        status: "SCHEDULED",
        title: title || `${track || profile.track || "Quran"} Lesson with ${teacher.name}`,
        scheduledStart: startTime,
        scheduledEnd: endTime,
        consumesQuota: true,
      });

      await db.insert(bookings).values({
        id: createId(),
        orgId: targetOrgId,
        userId: profile.userId,
        studentProfileId: profile.id,
        sessionId: sessionId,
        status: "CONFIRMED",
      });

      return NextResponse.json({
        success: true,
        message: `Assigned ${profile.name} to ${teacher.name}`,
        sessionId,
      });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
