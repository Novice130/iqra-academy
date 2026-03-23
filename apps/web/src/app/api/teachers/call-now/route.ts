/**
 * @fileoverview Teacher "Call Now" API
 *
 * RBAC: TEACHER role
 * POST /api/teachers/call-now — Sends push notification to student to join session
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { sessions, users } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { handleApiError, NotFoundError } from "@/lib/errors";
import { sendCallNowNotification } from "@/lib/push";
import { generateJitsiJwt, generateRoomName, buildJitsiUrl } from "@/lib/jitsi";

const callNowSchema = z.object({
  sessionId: z.string().min(1),
  studentUserId: z.string().min(1),
});

/** POST /api/teachers/call-now — trigger push notification for student */
export async function POST(request: NextRequest) {
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

    // Generate Jitsi room for the session
    const roomName = generateRoomName(sessionId);
    const studentJwt = await generateJitsiJwt({
      roomName,
      userName: student.name,
      userEmail: student.email,
      isModerator: false,
    });
    const joinUrl = buildJitsiUrl(roomName, studentJwt);

    // Update session with room info and set to IN_PROGRESS
    const teacher = await db.query.users.findFirst({
      where: eq(users.id, ctx.userId),
    });
    await db
      .update(sessions)
      .set({
        jitsiRoomName: roomName,
        status: "IN_PROGRESS",
        actualStart: new Date(),
      })
      .where(eq(sessions.id, sessionId));

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
}
