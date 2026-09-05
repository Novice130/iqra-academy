/**
 * @fileoverview Teacher Roster API
 *
 * RBAC: TEACHER, ORG_ADMIN, SUPER_ADMIN
 * GET /api/teachers/students — Lightweight list of the teacher's students,
 * for pickers (e.g. "add student to instant meeting").
 */

import { NextRequest, NextResponse } from "next/server";
import { db, withDb } from "@/lib/db";
import { bookings, sessions, studentProfiles } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { handleApiError } from "@/lib/errors";
import { and, eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireRole(request, ["TEACHER", "ORG_ADMIN", "SUPER_ADMIN"]);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const students = await db
        .selectDistinct({
          studentProfileId: studentProfiles.id,
          userId: studentProfiles.userId,
          name: studentProfiles.name,
        })
        .from(studentProfiles)
        .innerJoin(bookings, eq(bookings.studentProfileId, studentProfiles.id))
        .innerJoin(sessions, eq(bookings.sessionId, sessions.id))
        .where(
          and(
            eq(sessions.teacherId, ctx.userId),
            eq(sessions.orgId, ctx.orgId),
            eq(studentProfiles.orgId, ctx.orgId)
          )
        );

      return NextResponse.json({ students });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
