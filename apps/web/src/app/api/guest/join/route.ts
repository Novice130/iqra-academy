/**
 * @fileoverview Guest Knock API — no authentication by design.
 *
 * POST /api/guest/join — someone with the share link asks to be let into a
 * session. This creates a PENDING request and nothing else: no token is
 * issued here, so possessing the link never gets anyone into a class. The
 * host admits or denies from inside the call
 * (POST /api/sessions/[id]/guests), and only that step mints a token.
 *
 * The response deliberately carries just the class title and teacher's
 * name — enough for the guest to see they're knocking on the right door,
 * and nothing about the students.
 */

import { NextRequest, NextResponse } from "next/server";
import { db, withDb } from "@/lib/db";
import { and, eq, gt } from "drizzle-orm";
import { guestJoinRequests, sessions, users } from "@/db/schema";
import { handleApiError, NotFoundError, BusinessRuleError } from "@/lib/errors";
import { createId } from "@paralleldrive/cuid2";

/** A class nobody has started (or that ended hours ago) can't be knocked on. */
const JOINABLE_WINDOW_MS = 6 * 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  return withDb(async () => {
    try {
      const body = await request.json().catch(() => ({}));
      const sessionId: string | undefined = body?.sessionId;
      const rawName: string | undefined = body?.name;

      if (typeof sessionId !== "string" || typeof rawName !== "string") {
        throw new BusinessRuleError("sessionId and name are required");
      }
      const name = rawName.trim().slice(0, 60);
      if (name.length < 2) {
        throw new BusinessRuleError("Please enter your name.");
      }

      const session = await db.query.sessions.findFirst({
        where: eq(sessions.id, sessionId),
      });
      if (!session) throw new NotFoundError("Session");

      const startedRecently =
        session.status === "IN_PROGRESS" &&
        !!session.actualStart &&
        session.actualStart.getTime() > Date.now() - JOINABLE_WINDOW_MS;
      if (!startedRecently) {
        throw new BusinessRuleError("This class hasn't started yet. Try the link again once it's live.");
      }

      const teacher = await db.query.users.findFirst({
        where: eq(users.id, session.teacherId),
        columns: { name: true },
      });

      const id = createId();
      await db.insert(guestJoinRequests).values({
        id,
        orgId: session.orgId,
        sessionId,
        name,
        status: "PENDING",
      });

      return NextResponse.json({
        requestId: id,
        sessionTitle: session.title,
        teacherName: teacher?.name ?? null,
      });
    } catch (error) {
      return handleApiError(error);
    }
  });
}

/**
 * GET /api/guest/join?requestId=... — the guest polls their own request.
 * Returns a LiveKit token only once the host has admitted them.
 */
export async function GET(request: NextRequest) {
  return withDb(async () => {
    try {
      const requestId = new URL(request.url).searchParams.get("requestId");
      if (!requestId) throw new BusinessRuleError("requestId is required");

      const req = await db.query.guestJoinRequests.findFirst({
        where: eq(guestJoinRequests.id, requestId),
      });
      if (!req) throw new NotFoundError("Request");

      if (req.status !== "ADMITTED") {
        return NextResponse.json({ status: req.status });
      }

      const session = await db.query.sessions.findFirst({
        where: and(
          eq(sessions.id, req.sessionId),
          gt(sessions.actualStart, new Date(Date.now() - JOINABLE_WINDOW_MS))
        ),
      });
      if (!session) throw new BusinessRuleError("This class is no longer running.");

      const teacher = await db.query.users.findFirst({
        where: eq(users.id, session.teacherId),
        columns: { email: true },
      });

      // Imported lazily so the module isn't pulled in for the PENDING path.
      const { generateLiveKitToken, generateRoomName } = await import("@/lib/livekit");
      const roomName = generateRoomName(req.sessionId);
      const token = await generateLiveKitToken({
        roomName,
        userName: req.name,
        // Guests have no account, so their identity is the request id. It's
        // unique per knock, which is all LiveKit needs.
        userEmail: `guest-${req.id}`,
        isModerator: false,
      });

      return NextResponse.json({
        status: "ADMITTED",
        token,
        serverUrl: process.env.LIVEKIT_URL || "wss://meet.novicetutor.com",
        userName: req.name,
        teacherIdentity: teacher?.email ?? null,
      });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
