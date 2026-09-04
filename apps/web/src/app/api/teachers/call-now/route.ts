/**
 * @fileoverview Teacher "Call Now" API
 *
 * RBAC: TEACHER role
 * POST /api/teachers/call-now — Sends push notification to student to join session
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, withDb } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { sessions, users } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { handleApiError, NotFoundError } from "@/lib/errors";
import { sendCallNowNotification } from "@/lib/push";
import { generateLiveKitToken, generateRoomName } from "@/lib/livekit";
import { startScheduledOccurrence } from "@/lib/meeting-service";

const callNowSchema = z.object({
  sessionId: z.string().min(1),
  studentUserId: z.string().min(1),
});

/** POST /api/teachers/call-now — trigger push notification for student */
export async function POST(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireRole(request, ["TEACHER"]);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const body = await request.json();
      const { sessionId, studentUserId } = callNowSchema.parse(body);

      // Verify session exists and teacher is assigned
      const session = await db.query.sessions.findFirst({
        where: and(eq(sessions.id, sessionId), eq(sessions.teacherId, ctx.userId)),
      });
      if (!session) throw new NotFoundError("Session");

      // Get student info and push subscriptions
      const student = await db.query.users.findFirst({
        where: eq(users.id, studentUserId),
        with: { pushSubscriptions: true },
      });
      if (!student) throw new NotFoundError("Student");

      // Start scheduled occurrence via meeting service (sets IN_PROGRESS, actualStart, videoRoomName, and notifies students)
      const { roomName } = await startScheduledOccurrence({
        sessionId,
        teacherId: ctx.userId,
        orgId: session.orgId,
      });

      // Generate LiveKit room token for the session
      const studentToken = await generateLiveKitToken({
        roomName,
        userName: student.name,
        userEmail: student.email,
        isModerator: false,
      });
      const joinUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://novicetutor.com"}/dashboard/session/${sessionId}`;

      const teacher = await db.query.users.findFirst({
        where: eq(users.id, ctx.userId),
      });

      // Send push notifications to all student devices
      const delivered = await sendCallNowNotification(
        student.pushSubscriptions.map((s) => ({
          endpoint: s.endpoint,
          p256dh: s.p256dh,
          auth: s.auth,
        })),
        teacher?.name || "Your teacher",
        session.title || "Quran Class",
        joinUrl
      );

      return NextResponse.json({
        success: true,
        notificationsSent: delivered,
        roomName,
      });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
