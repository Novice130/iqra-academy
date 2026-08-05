/**
 * @fileoverview Direct Call API
 *
 * RBAC: TEACHER, ORG_ADMIN, SUPER_ADMIN
 * POST /api/calls — Teacher "calls" a specific student. Two modes:
 *   - No `sessionId`: creates a fresh instant session and rings into it
 *     (used by the pre-meeting "Call" button on My Students).
 *   - `sessionId` provided: rings a student into an ALREADY-RUNNING session
 *     (used by the in-call "Add Student" button — a Teams-style "bring in
 *     the student who didn't show up" without ending the current call).
 * Either way the student's dashboard polls GET /api/calls/incoming and
 * shows a full-screen ring UI.
 */

import { NextRequest, NextResponse } from "next/server";
import { db, withDb } from "@/lib/db";
import { bookings, callInvites, sessions, studentProfiles, users } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { handleApiError, NotFoundError, ForbiddenError } from "@/lib/errors";
import { generateLiveKitToken, generateRoomName } from "@/lib/livekit";
import { and, eq } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";

export async function POST(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireRole(request, ["TEACHER", "ORG_ADMIN", "SUPER_ADMIN"]);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const body = await request.json().catch(() => ({}));
      const studentProfileId: string | undefined = body?.studentProfileId;
      const existingSessionId: string | undefined = body?.sessionId;
      if (!studentProfileId) {
        throw new ForbiddenError("studentProfileId is required");
      }

      const [teacher, studentProfile] = await Promise.all([
        db.query.users.findFirst({ where: eq(users.id, ctx.userId) }),
        db.query.studentProfiles.findFirst({ where: eq(studentProfiles.id, studentProfileId) }),
      ]);
      if (!teacher) throw new NotFoundError("Teacher");
      if (!studentProfile) throw new NotFoundError("Student");

      let sessionId: string;
      let roomName: string;
      let token: string | null = null;

      if (existingSessionId) {
        const existingSession = await db.query.sessions.findFirst({
          where: eq(sessions.id, existingSessionId),
        });
        if (!existingSession) throw new NotFoundError("Session");
        if (existingSession.teacherId !== ctx.userId && !["ORG_ADMIN", "SUPER_ADMIN"].includes(ctx.role)) {
          throw new ForbiddenError("Not your session.");
        }
        if (!existingSession.videoRoomName) throw new ForbiddenError("Session has no active room.");

        sessionId = existingSession.id;
        roomName = existingSession.videoRoomName;

        // Ring-ins can target a student who never had a booking for this
        // exact session (e.g. a substitute or an ad-hoc addition) — make
        // sure one exists so their join isn't rejected by RBAC.
        const existingBooking = await db.query.bookings.findFirst({
          where: and(eq(bookings.sessionId, sessionId), eq(bookings.studentProfileId, studentProfile.id)),
        });
        if (!existingBooking) {
          await db.insert(bookings).values({
            id: createId(),
            orgId: existingSession.orgId,
            userId: studentProfile.userId,
            studentProfileId: studentProfile.id,
            sessionId,
            status: "CONFIRMED",
          });
        }
      } else {
        sessionId = createId();
        roomName = generateRoomName(sessionId);
        const now = new Date();
        const end = new Date(now.getTime() + 60 * 60 * 1000);

        await db.insert(sessions).values({
          id: sessionId,
          orgId: ctx.orgId || "seed_org_iqra_academy",
          teacherId: ctx.userId,
          type: "INDIVIDUAL",
          status: "IN_PROGRESS",
          title: `Instant Meeting with ${teacher.name}`,
          scheduledStart: now,
          scheduledEnd: end,
          actualStart: now,
          consumesQuota: false,
          videoRoomName: roomName,
        });

        token = await generateLiveKitToken({
          roomName,
          userName: teacher.name,
          userEmail: teacher.email,
          isModerator: true,
        });
      }

      const callId = createId();
      await db.insert(callInvites).values({
        id: callId,
        orgId: ctx.orgId || "seed_org_iqra_academy",
        sessionId,
        callerId: ctx.userId,
        calleeId: studentProfile.userId,
        status: "RINGING",
      });

      return NextResponse.json({
        callId,
        sessionId,
        roomName,
        token,
        joinUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://novicetutor.com"}/dashboard/session/${sessionId}`,
      });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
