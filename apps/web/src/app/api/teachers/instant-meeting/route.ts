/**
 * @fileoverview Teacher Instant Meeting API
 *
 * RBAC: TEACHER, ORG_ADMIN, SUPER_ADMIN
 * POST /api/teachers/instant-meeting — puts the teacher in a live room now.
 *
 * "Instant" does NOT mean "new". A teacher whose class is on the calendar and
 * who presses this button wants to be in *that* class — minting a fresh
 * session row instead is how the students end up in one room and the teacher
 * in another, since every student's dashboard links at the scheduled row.
 *
 * So the order is: a class already running → resume it; a class scheduled
 * around now → start that one; nothing at all → create an ad-hoc session.
 */

import { NextRequest, NextResponse } from "next/server";
import { withDb } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { handleApiError } from "@/lib/errors";
import {
  resolveStartTarget,
  startScheduledOccurrence,
  createInstantMeeting,
} from "@/lib/meeting-service";
import { generateLiveKitToken, generateRoomName } from "@/lib/livekit";
import { db } from "@/lib/db";
import { users, bookings, studentProfiles } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
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

      const target = await resolveStartTarget(ctx.userId, ctx.orgId);

      if (target.kind === "running" || target.kind === "scheduled") {
        const existing = target.session;
        const sessionId = existing.id;
        const roomName = existing.videoRoomName || generateRoomName(sessionId);

        if (target.kind === "scheduled") {
          await startScheduledOccurrence({
            sessionId,
            teacherId: ctx.userId,
            orgId: ctx.orgId,
          });
        }

        // Add any explicit students requested who are not yet booked
        let addedStudents: { studentProfileId: string; userId: string; name: string }[] = [];
        if (studentProfileIds.length > 0) {
          const alreadyBooked = await db.query.bookings.findMany({
            where: eq(bookings.sessionId, sessionId),
            columns: { userId: true },
          });
          const bookedUserIds = new Set(alreadyBooked.map((b) => b.userId));

          const profiles = await db.query.studentProfiles.findMany({
            where: and(
              inArray(studentProfiles.id, studentProfileIds),
              eq(studentProfiles.orgId, ctx.orgId)
            ),
          });
          const fresh = profiles.filter((p) => !bookedUserIds.has(p.userId));
          if (fresh.length > 0) {
            await db.insert(bookings).values(
              fresh.map((p) => ({
                id: createId(),
                orgId: ctx.orgId,
                userId: p.userId,
                studentProfileId: p.id,
                sessionId,
                status: "CONFIRMED" as const,
              }))
            );
            addedStudents = fresh.map((p) => ({
              studentProfileId: p.id,
              userId: p.userId,
              name: p.name,
            }));
          }
        }

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
          resumed: target.kind,
          title: existing.title,
        });
      }

      // Ad-hoc instant meeting
      const instant = await createInstantMeeting({
        orgId: ctx.orgId,
        teacherId: ctx.userId,
        studentProfileIds,
      });

      return NextResponse.json({
        success: true,
        sessionId: instant.sessionId,
        roomName: instant.roomName,
        token: instant.token,
        joinUrl: instant.joinUrl,
        addedStudents: instant.addedStudents,
        resumed: null,
        title: instant.title,
      });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
