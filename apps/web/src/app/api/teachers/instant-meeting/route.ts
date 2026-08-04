/**
 * @fileoverview Teacher Instant Meeting API
 *
 * RBAC: TEACHER, ORG_ADMIN, SUPER_ADMIN
 * POST /api/teachers/instant-meeting — Creates an ad-hoc session and generates a LiveKit token
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sessions, users } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { handleApiError } from "@/lib/errors";
import { generateLiveKitToken, generateRoomName } from "@/lib/livekit";
import { eq } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ["TEACHER", "ORG_ADMIN", "SUPER_ADMIN"]);
    if (authResult instanceof NextResponse) return authResult;
    const ctx = authResult;

    const teacher = await db.query.users.findFirst({
      where: eq(users.id, ctx.userId),
    });

    if (!teacher) {
      throw new Error("Teacher not found");
    }

    const sessionId = createId();
    const roomName = generateRoomName(sessionId);

    // Create the instant session
    const now = new Date();
    const end = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour default

    await db.insert(sessions).values({
      id: sessionId,
      orgId: ctx.orgId || "seed_org_iqra_academy", // Fallback for safety
      teacherId: ctx.userId,
      type: "INDIVIDUAL", // Instant meetings are handled dynamically, INDIVIDUAL is fine as a placeholder
      status: "IN_PROGRESS",
      title: `Instant Meeting with ${teacher.name}`,
      scheduledStart: now,
      scheduledEnd: end,
      actualStart: now,
      consumesQuota: false, // Ad-hoc meetings don't consume quota automatically
      videoRoomName: roomName,
    });

    // Generate token for the teacher
    const token = await generateLiveKitToken({
      roomName,
      userName: teacher.name,
      userEmail: teacher.email,
      isModerator: true,
    });

    return NextResponse.json({
      success: true,
      sessionId,
      roomName,
      token,
      joinUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://novicetutor.com"}/dashboard/session/${sessionId}`,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
