/**
 * @fileoverview Teacher Sessions API
 *
 * RBAC: TEACHER role
 * GET /api/teachers/sessions — List assigned sessions for the teacher
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { eq, and, asc } from "drizzle-orm";
import { sessions } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { handleApiError } from "@/lib/errors";

/** GET /api/teachers/sessions — returns sessions assigned to this teacher */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ["TEACHER"]);
    if (authResult instanceof NextResponse) return authResult;
    const ctx = authResult;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") || "20");

    const conditions = [
      eq(sessions.teacherId, ctx.userId),
      eq(sessions.orgId, ctx.orgId),
    ];
    if (status) conditions.push(eq(sessions.status, status as typeof sessions.status.enumValues[number]));

    const result = await db.query.sessions.findMany({
      where: and(...conditions),
      with: {
        bookings: {
          with: { user: { columns: { id: true, name: true, email: true } } },
        },
        attendees: {
          with: { studentProfile: { columns: { id: true, name: true, currentLevel: true } } },
        },
      },
      orderBy: asc(sessions.scheduledStart),
      limit: Math.min(limit, 100),
    });

    return NextResponse.json({ sessions: result });
  } catch (error) {
    return handleApiError(error);
  }
}
