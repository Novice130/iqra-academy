/**
 * @fileoverview Session Join API — generates Jitsi JWT for a session
 *
 * RBAC: STUDENT or TEACHER
 * GET /api/sessions/[id]/join — Get JWT to join the Jitsi room
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { sessions, users, bookings, studentProfiles } from "@/db/schema";
import { requireAuth } from "@/lib/rbac";
import { handleApiError, NotFoundError, ForbiddenError } from "@/lib/errors";
import { generateLiveKitToken, generateRoomName } from "@/lib/livekit";
import { createId } from "@paralleldrive/cuid2";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const ctx = authResult;
    const { id: sessionId } = await params;

    const session = await db.query.sessions.findFirst({
      where: eq(sessions.id, sessionId),
      with: { bookings: true },
    });

    if (!session) throw new NotFoundError("Session");

    const user = await db.query.users.findFirst({
      where: eq(users.id, ctx.userId),
    });
    if (!user) throw new NotFoundError("User");

    const isAdmin = ["ORG_ADMIN", "SUPER_ADMIN"].includes(user.role);
    const isTeacher = session.teacherId === ctx.userId || isAdmin;
    let isStudent = session.bookings.some((b: any) => b.userId === ctx.userId);
    const isInstantMeeting = session.consumesQuota === false && session.title?.startsWith("Instant Meeting");

    // Auto-book students if it's an instant meeting
    if (isInstantMeeting && !isStudent && !isTeacher) {
      const profiles = await db.query.studentProfiles.findMany({
        where: eq(studentProfiles.userId, ctx.userId)
      });
      
      if (profiles.length > 0) {
         await db.insert(bookings).values({
           id: createId(),
           orgId: session.orgId,
           userId: ctx.userId,
           studentProfileId: profiles[0].id,
           sessionId: session.id,
           status: "CONFIRMED",
         });
         isStudent = true;
      }
    }

    if (!isTeacher && !isStudent) {
      throw new ForbiddenError("You are not part of this session.");
    }

    const roomName = generateRoomName(sessionId);
    const token = await generateLiveKitToken({
      roomName,
      userName: user?.name || "Participant",
      userEmail: user?.email || "",
      isModerator: isTeacher,
    });

    // Update room name on session if not set
    if (!session.videoRoomName) {
      await db
        .update(sessions)
        .set({ videoRoomName: roomName })
        .where(eq(sessions.id, sessionId));
    }

    return NextResponse.json({
      roomName,
      token,
      serverUrl: process.env.LIVEKIT_URL || "wss://meet.novicetutor.com",
      userName: user?.name || "Participant",
      joinUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://novicetutor.com"}/dashboard/session/${sessionId}`,
      isModerator: isTeacher,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
