/**
 * @fileoverview Admin Assign Student API
 *
 * RBAC: ORG_ADMIN, SUPER_ADMIN
 * POST /api/admin/assign-student — Assign a student profile to a teacher by scheduling classes or creating bookings.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sessions, bookings, studentProfiles, users } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { handleApiError, NotFoundError } from "@/lib/errors";
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ["ORG_ADMIN", "SUPER_ADMIN"]);
    if (authResult instanceof NextResponse) return authResult;
    const ctx = authResult;

    const body = await request.json();
    const { studentProfileId, teacherId, title } = body;

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

    // Check if there is already a scheduled session or create a recurring assignment session
    const sessionId = createId();
    const now = new Date();
    const startTime = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Tomorrow
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 1 hr

    await db.insert(sessions).values({
      id: sessionId,
      orgId: ctx.orgId || profile.orgId,
      teacherId: teacher.id,
      type: "INDIVIDUAL",
      status: "SCHEDULED",
      title: title || `Quran Lesson with ${teacher.name}`,
      scheduledStart: startTime,
      scheduledEnd: endTime,
      consumesQuota: true,
    });

    await db.insert(bookings).values({
      id: createId(),
      orgId: ctx.orgId || profile.orgId,
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
}
