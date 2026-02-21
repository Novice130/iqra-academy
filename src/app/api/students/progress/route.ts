/**
 * @fileoverview Student Progress API
 *
 * RBAC: STUDENT role
 * GET /api/students/progress — View progress for all child profiles
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { studentProfiles } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { handleApiError } from "@/lib/errors";

/** GET /api/students/progress — returns all profiles with their progress records */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ["STUDENT"]);
    if (authResult instanceof NextResponse) return authResult;
    const ctx = authResult;

    const profiles = await db.query.studentProfiles.findMany({
      where: eq(studentProfiles.userId, ctx.userId),
      with: {
        progressRecords: {
          orderBy: (pr, { desc }) => [desc(pr.createdAt)],
        },
      },
    });

    // Calculate summary stats per profile
    const progressData = profiles.map((profile) => {
      const total = profile.progressRecords.length;
      const completed = profile.progressRecords.filter((r) => r.isCompleted).length;
      const approved = profile.progressRecords.filter((r) => r.teacherApproved).length;

      return {
        profileId: profile.id,
        profileName: profile.name,
        currentLevel: profile.currentLevel,
        stats: { total, completed, approved, completionRate: total > 0 ? Math.round((completed / total) * 100) : 0 },
        recentProgress: profile.progressRecords.slice(0, 10),
      };
    });

    return NextResponse.json({ progress: progressData });
  } catch (error) {
    return handleApiError(error);
  }
}
