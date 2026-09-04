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
import { db, withHttpDb } from "@/lib/db";
import { and, count, desc, eq, gt, inArray, or } from "drizzle-orm";
import { guestJoinRequests, sessions, users } from "@/db/schema";
import { handleApiError, NotFoundError, BusinessRuleError } from "@/lib/errors";
import { resolveClassRoom } from "@/lib/class-room";
import { createId } from "@paralleldrive/cuid2";

/** A class nobody has started (or that ended hours ago) can't be knocked on. */
const JOINABLE_WINDOW_MS = 6 * 60 * 60 * 1000;

/** How long a knock stays live before it's treated as abandoned. */
const KNOCK_WINDOW_MS = 10 * 60 * 1000;

/**
 * How long an admission remains valid for a session (4 hours).
 * Once admitted by the host, the guest can refresh or rejoin through the same link
 * throughout the entire class without requiring host re-approval.
 */
const ADMIT_GRACE_MS = 4 * 60 * 60 * 1000;

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
  if (session.status === "COMPLETED" || session.status === "CANCELLED") return false;
  return true;
}

function normalizeJoinCode(code: string) {
  if (!code) return code;
  const trimmed = code.trim();
  const digitsOnly = trimmed.replace(/\D/g, '');
  if (digitsOnly.length === 12) {
    return `${digitsOnly.slice(0, 3)}-${digitsOnly.slice(3, 6)}-${digitsOnly.slice(6, 9)}-${digitsOnly.slice(9, 12)}`;
  }
  const clean = trimmed.replace(/[^a-zA-Z]/g, '').toLowerCase();
  if (clean.length === 12) {
    return `${clean.slice(0, 4)}-${clean.slice(4, 8)}-${clean.slice(8, 12)}`;
  }
  return trimmed;
}

export async function POST(request: NextRequest) {
  return withHttpDb(async () => {
    try {
      const body = await request.json().catch(() => ({}));
      const sessionIdRaw: string | undefined = body?.sessionId;
      const rawName: string | undefined = body?.name;

      if (typeof sessionIdRaw !== "string" || typeof rawName !== "string") {
        throw new BusinessRuleError("sessionId and name are required");
      }

      const sessionId = normalizeJoinCode(sessionIdRaw);
      const rawTrimmed = sessionIdRaw.trim();
      const rawClean = rawTrimmed.replace(/[\s-]/g, "");
      const name = rawName.trim().slice(0, 60);
      if (name.length < 2) {
        throw new BusinessRuleError("Please enter your name.");
      }

      const rawSession = await db.query.sessions.findFirst({
        where: or(
          eq(sessions.id, sessionId),
          eq(sessions.joinCode, sessionId),
          eq(sessions.joinCode, rawTrimmed),
          eq(sessions.joinCode, rawClean),
          eq(sessions.id, rawTrimmed),
          eq(sessions.id, rawClean)
        ),
      });
      if (!rawSession) throw new NotFoundError("Session");

      // Resolve to canonical room so knocks land where the teacher actually is
      const resolution = await resolveClassRoom(rawSession);
      const session = resolution.session;

      if (session.status === "COMPLETED" || session.status === "CANCELLED" || rawSession.status === "COMPLETED" || rawSession.status === "CANCELLED") {
        throw new BusinessRuleError("This class has already ended.");
      }

      if (resolution.kind === "too-early") {
        throw new BusinessRuleError("This class has not opened yet. Please try again closer to start time.");
      }

      if (resolution.kind === "expired") {
        throw new BusinessRuleError("This class scheduled time has expired.");
      }

      const targetSessionIds = Array.from(
        new Set([sessionId, rawSession.id, session.id, session.mergedIntoId].filter(Boolean) as string[])
      );

      const teacher = await db.query.users.findFirst({
        where: eq(users.id, session.teacherId),
        columns: { name: true, email: true },
      });

      const admittedSince = new Date(Date.now() - ADMIT_GRACE_MS);

      // 1. Re-admission requires the requestId secret from the original knock.
      // A name alone is not a credential ("Ali" is guessable): without the
      // secret this falls through to the PENDING path below, and the guest
      // polls GET ?requestId=... like everyone else.
      const presentedRequestId: string | undefined =
        typeof (body as Record<string, unknown>)?.requestId === "string"
          ? (body as Record<string, unknown>).requestId as string
          : undefined;

      if (presentedRequestId) {
        const alreadyAdmitted = await db.query.guestJoinRequests.findFirst({
          where: and(
            eq(guestJoinRequests.id, presentedRequestId),
            inArray(guestJoinRequests.sessionId, targetSessionIds),
            eq(guestJoinRequests.name, name),
            eq(guestJoinRequests.status, "ADMITTED"),
            gt(guestJoinRequests.createdAt, admittedSince)
          ),
          orderBy: [desc(guestJoinRequests.respondedAt)],
        });

        if (alreadyAdmitted) {
          const { generateLiveKitToken, generateRoomName } = await import("@/lib/livekit");
          const roomName = generateRoomName(session.id);
          const token = await generateLiveKitToken({
            roomName,
            userName: name,
            userEmail: `guest-${alreadyAdmitted.id}`,
            isModerator: false,
          });

          return NextResponse.json({
            status: "ADMITTED",
            requestId: alreadyAdmitted.id,
            token,
            serverUrl: process.env.LIVEKIT_URL || "wss://meet.novicetutor.com",
            userName: name,
            sessionTitle: session.title,
            teacherName: teacher?.name ?? null,
            teacherIdentity: teacher?.email ?? null,
          });
        }
      }

      // Check if room is locked by the host
      const { generateRoomName, getRoomServiceClient } = await import("@/lib/livekit");
      const { parseRoomMetadata } = await import("@/lib/room-metadata");
      const checkRoomName = generateRoomName(session.id);
      try {
        const rooms = await getRoomServiceClient().listRooms([checkRoomName]);
        const meta = parseRoomMetadata(rooms[0]?.metadata);
        if (meta.isLocked) {
          throw new BusinessRuleError("This meeting is locked by the host.");
        }
      } catch (err: any) {
        if (err instanceof BusinessRuleError) throw err;
      }

      const knockedSince = new Date(Date.now() - KNOCK_WINDOW_MS);

      // 2. Knocking twice is the same knock. Match on canonical session or requested session
      const existing = await db.query.guestJoinRequests.findFirst({
        where: and(
          inArray(guestJoinRequests.sessionId, targetSessionIds),
          eq(guestJoinRequests.name, name),
          eq(guestJoinRequests.status, "PENDING"),
          gt(guestJoinRequests.createdAt, knockedSince)
        ),
      });
      if (existing) {
        return NextResponse.json({
          status: "PENDING",
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
            inArray(guestJoinRequests.sessionId, targetSessionIds),
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
        sessionId: session.id,
        name,
        status: "PENDING",
      });

      return NextResponse.json({
        status: "PENDING",
        requestId: id,
        sessionId: session.id,
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
  return withHttpDb(async () => {
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

      const rawSession = await db.query.sessions.findFirst({
        where: eq(sessions.id, req.sessionId),
      });
      if (!rawSession) throw new NotFoundError("Session");

      const resolution = await resolveClassRoom(rawSession);
      const session = resolution.session;

      if (session.status === "COMPLETED" || session.status === "CANCELLED" || rawSession.status === "COMPLETED" || rawSession.status === "CANCELLED") {
        throw new BusinessRuleError("This class has already ended.");
      }
      if (resolution.kind === "expired") {
        throw new BusinessRuleError("This class scheduled time has expired.");
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
        sessionId: session.id,
        teacherIdentity: teacher?.email ?? null,
      });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
