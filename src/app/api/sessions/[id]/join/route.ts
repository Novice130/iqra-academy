/**
 * @fileoverview Session Join API — generates Jitsi JWT for a session
 *
 * RBAC: STUDENT or TEACHER
 * GET /api/sessions/[id]/join — Get JWT to join the Jitsi room
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { sessions, users } from "@/db/schema";
import { requireAuth } from "@/lib/rbac";
import { handleApiError, NotFoundError, ForbiddenError } from "@/lib/errors";
import { generateJitsiJwt, generateRoomName, buildJitsiUrl } from "@/lib/jitsi";

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

    // Verify user has access (teacher or booked student)
    const isTeacher = session.teacherId === ctx.userId;
    const isStudent = session.bookings.some((b) => b.userId === ctx.userId);

    if (!isTeacher && !isStudent) {
      throw new ForbiddenError("You are not part of this session.");
    }

    const roomName = generateRoomName(sessionId);
    const user = await db.query.users.findFirst({
      where: eq(users.id, ctx.userId),
    });

    const jwt = await generateJitsiJwt({
      roomName,
      userName: user?.name || "Participant",
      userEmail: user?.email || "",
      isModerator: isTeacher,
    });

    // Update room name on session if not set
    if (!session.jitsiRoomName) {
      await db
        .update(sessions)
        .set({ jitsiRoomName: roomName })
        .where(eq(sessions.id, sessionId));
    }

    return NextResponse.json({
      roomName,
      jwt,
      joinUrl: buildJitsiUrl(roomName, jwt),
      isModerator: isTeacher,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
