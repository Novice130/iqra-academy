/**
 * @fileoverview Teacher Instant Meeting API
 *
 * RBAC: TEACHER, ORG_ADMIN, SUPER_ADMIN
 * POST /api/teachers/instant-meeting — Creates an ad-hoc session and generates a LiveKit token
 */

import { NextRequest, NextResponse } from "next/server";
import { db, withDb } from "@/lib/db";
import { bookings, notifications, sessions, studentProfiles, users } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { handleApiError } from "@/lib/errors";
import { generateLiveKitToken, generateRoomName } from "@/lib/livekit";
import { eq, inArray } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";

export async function POST(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireRole(request, ["TEACHER", "ORG_ADMIN", "SUPER_ADMIN"]);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const body = await request.json().catch(() => ({}));
      const studentProfileIds: string[] = Array.isArray(body?.studentProfileIds)
        ? body.studentProfileIds
        : [];

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

      // Add selected students: pre-book them so they're recognized on join,
      // and drop a notification so their dashboard can surface "meeting started".
      let addedStudents: { studentProfileId: string; userId: string; name: string }[] = [];
      if (studentProfileIds.length > 0) {
        const profiles = await db.query.studentProfiles.findMany({
          where: inArray(studentProfiles.id, studentProfileIds),
        });

        if (profiles.length > 0) {
          await db.insert(bookings).values(
            profiles.map((p) => ({
              id: createId(),
              orgId: ctx.orgId || "seed_org_iqra_academy",
              userId: p.userId,
              studentProfileId: p.id,
              sessionId,
              status: "CONFIRMED" as const,
            }))
          );

          await db.insert(notifications).values(
            profiles.map((p) => ({
              id: createId(),
              orgId: ctx.orgId || "seed_org_iqra_academy",
              userId: p.userId,
              type: "MEETING_STARTED" as const,
              sessionId,
              message: `${teacher.name} started a meeting and added you. Join now.`,
            }))
          );

          addedStudents = profiles.map((p) => ({ studentProfileId: p.id, userId: p.userId, name: p.name }));
        }
      }

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
        addedStudents,
      });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
