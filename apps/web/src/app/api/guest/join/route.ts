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
import { and, count, eq, gt } from "drizzle-orm";
import { guestJoinRequests, sessions, users } from "@/db/schema";
import { handleApiError, NotFoundError, BusinessRuleError } from "@/lib/errors";
import { createId } from "@paralleldrive/cuid2";

/** A class nobody has started (or that ended hours ago) can't be knocked on. */
const JOINABLE_WINDOW_MS = 6 * 60 * 60 * 1000;

/** How long a knock stays live before it's treated as abandoned. */
const KNOCK_WINDOW_MS = 10 * 60 * 1000;

/**
 * How long an admission is good for. The guest's requestId travels in a URL
 * they can forward, so an ADMITTED row that never expires is a bearer
 * credential for the whole class. Long enough to survive a page reload or a
 * phone waking up; short enough that a forwarded link is dead on arrival.
 */
const ADMIT_GRACE_MS = 2 * 60 * 1000;

/** Enough guests to cover a real class; a script pointed at this endpoint stops here. */
const MAX_PENDING_PER_SESSION = 12;

type SessionRow = typeof sessions.$inferSelect;

/**
 * The one predicate for "this class can be joined". Both halves of this file
 * use it: the GET path used to check only actualStart, so a guest kept being
 * handed fresh tokens after the teacher ended the class — and LiveKit
 * auto-creates rooms on join, so they'd sit in an unsupervised room alone.
 */
function isJoinable(session: SessionRow): boolean {
  return (
    session.status === "IN_PROGRESS" &&
    !!session.actualStart &&
    session.actualStart.getTime() > Date.now() - JOINABLE_WINDOW_MS
  );
}

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

      if (!isJoinable(session)) {
        throw new BusinessRuleError("This class hasn't started yet. Try the link again once it's live.");
      }

      const teacher = await db.query.users.findFirst({
        where: eq(users.id, session.teacherId),
        columns: { name: true },
      });

      const knockedSince = new Date(Date.now() - KNOCK_WINDOW_MS);

      // Knocking twice is the same knock. Without this, the "Ask again"
      // button and an impatient double-tap both stack another card on the
      // host's screen.
      const existing = await db.query.guestJoinRequests.findFirst({
        where: and(
          eq(guestJoinRequests.sessionId, sessionId),
          eq(guestJoinRequests.name, name),
          eq(guestJoinRequests.status, "PENDING"),
          gt(guestJoinRequests.createdAt, knockedSince)
        ),
      });
      if (existing) {
        return NextResponse.json({
          requestId: existing.id,
          sessionTitle: session.title,
          teacherName: teacher?.name ?? null,
        });
      }

      // This endpoint is unauthenticated and every PENDING row draws a card
      // over the host's video, so an uncapped insert is a way to bury the
      // call UI mid-lesson.
      const [{ pending }] = await db
        .select({ pending: count() })
        .from(guestJoinRequests)
        .where(
          and(
            eq(guestJoinRequests.sessionId, sessionId),
            eq(guestJoinRequests.status, "PENDING"),
            gt(guestJoinRequests.createdAt, knockedSince)
          )
        );
      if (pending >= MAX_PENDING_PER_SESSION) {
        throw new BusinessRuleError("Too many people are waiting to be let in. Try again in a few minutes.");
      }

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
 * Returns a LiveKit token only once the host has admitted them, and only
 * inside ADMIT_GRACE_MS of that admission.
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

      // A knock nobody answered is expired, not eternally pending. Writing it
      // here is what makes the waiting screen able to give up: the status is
      // the only thing the guest can see.
      if (req.status === "PENDING" && req.createdAt.getTime() < Date.now() - KNOCK_WINDOW_MS) {
        await db
          .update(guestJoinRequests)
          .set({ status: "EXPIRED" })
          .where(eq(guestJoinRequests.id, req.id));
        return NextResponse.json({ status: "EXPIRED" });
      }

      if (req.status !== "ADMITTED") {
        return NextResponse.json({ status: req.status });
      }

      const admittedAt = req.respondedAt?.getTime() ?? req.createdAt.getTime();
      if (admittedAt < Date.now() - ADMIT_GRACE_MS) {
        await db
          .update(guestJoinRequests)
          .set({ status: "EXPIRED" })
          .where(eq(guestJoinRequests.id, req.id));
        return NextResponse.json({ status: "EXPIRED" });
      }

      const session = await db.query.sessions.findFirst({
        where: eq(sessions.id, req.sessionId),
      });
      if (!session || !isJoinable(session)) {
        throw new BusinessRuleError("This class is no longer running.");
      }

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
