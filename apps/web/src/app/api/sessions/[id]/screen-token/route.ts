/**
 * @fileoverview Screen-share token — the Android app's way into the room.
 *
 * RBAC: anyone already entitled to be in this session (its teacher, an
 * org/super admin, or a booked student) — the same people the Share button is
 * offered to in the browser.
 * GET /api/sessions/[id]/screen-token
 *
 * WHY THIS EXISTS AT ALL:
 * Android's WebView does not implement `getDisplayMedia`, so the call page
 * running inside the app physically cannot capture the screen — the API is
 * not merely blocked, it is absent. The native shell captures via
 * MediaProjection instead and joins the same LiveKit room as a second,
 * screen-only connection. This endpoint is what it joins with.
 *
 * The page asks for this token and hands it to the shell, rather than the
 * shell fetching it itself: the session cookie lives in the WebView, and
 * Dart's HTTP client is a different cookie jar entirely.
 *
 * The room name is derived from the id in the URL with no `resolveClassRoom`
 * hop, unlike /join. By the time anything can ask for a screen token the page
 * is already *in* the call, which only ever happens on the canonical row —
 * /join redirected it there before the room was ever opened.
 */

import { NextRequest, NextResponse } from "next/server";
import { db, withDb } from "@/lib/db";
import { eq } from "drizzle-orm";
import { sessions, users } from "@/db/schema";
import { requireAuth } from "@/lib/rbac";
import { handleApiError, NotFoundError, ForbiddenError } from "@/lib/errors";
import { generateLiveKitToken, generateRoomName } from "@/lib/livekit";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withDb(async () => {
    try {
      const authResult = await requireAuth(request);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;
      const { id: sessionId } = await params;

      const [session, user] = await Promise.all([
        db.query.sessions.findFirst({
          where: eq(sessions.id, sessionId),
          with: { bookings: true },
        }),
        db.query.users.findFirst({ where: eq(users.id, ctx.userId) }),
      ]);

      if (!session) throw new NotFoundError("Session");
      if (!user) throw new NotFoundError("User");

      // An admin can join only their own org's sessions. SUPER_ADMIN is the
      // only role allowed across orgs.
      const isAdmin =
        user.role === "SUPER_ADMIN" ||
        (user.role === "ORG_ADMIN" && user.orgId === session.orgId);
      const isTeacher = session.teacherId === ctx.userId || isAdmin;
      const isStudent = session.bookings.some((b: { userId: string }) => b.userId === ctx.userId);

      // No auto-booking here, deliberately. /join is the door; this is only
      // ever reached by someone the door already let through, and a token
      // endpoint that quietly enrolls people is not one worth having.
      if (!isTeacher && !isStudent) {
        throw new ForbiddenError("You are not part of this session.");
      }

      const token = await generateLiveKitToken({
        roomName: generateRoomName(sessionId),
        userName: user.name || "Participant",
        userEmail: user.email || "",
        isModerator: isTeacher,
        screenShare: true,
        // Shorter than a join token: this one is handed out of the WebView to
        // the native side, and it only has to survive the share itself.
        expiresInSeconds: 3600,
      });

      return NextResponse.json({
        token,
        roomName: generateRoomName(sessionId),
        url: process.env.LIVEKIT_URL || "wss://meet.novicetutor.com",
      });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
