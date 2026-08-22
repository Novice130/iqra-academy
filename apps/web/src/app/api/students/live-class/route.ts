/**
 * @fileoverview Live Class Poll API
 *
 * RBAC: any authenticated user
 * GET /api/students/live-class — "is my teacher in a room right now?"
 *
 * WHY THIS EXISTS: a student's own dashboard only ever linked to *their*
 * scheduled session. When the teacher started an instant meeting, that's a
 * different session row — so tapping "Join Class" put the student in an empty
 * room of their own while the teacher waited in theirs. This endpoint resolves
 * the session the teacher is *actually* in, so the ribbon can send the student
 * to the same LiveKit room.
 *
 * A student is considered "one of the teacher's students" if they have ever
 * been booked into any session that teacher ran — the same relationship
 * /api/teachers/students uses in the other direction.
 */

import { NextRequest, NextResponse } from "next/server";
import { db, withHttpDb } from "@/lib/db";
import { bookings, sessions, users } from "@/db/schema";
import { requireAuth } from "@/lib/rbac";
import { handleApiError } from "@/lib/errors";
import { FALLBACK_CADENCE, pollCadenceFor } from "@/lib/poll-cadence";
import { and, desc, eq, gt, inArray } from "drizzle-orm";

/**
 * Sessions are only surfaced for a few hours after they start. Rooms are
 * left IN_PROGRESS when a teacher closes the tab instead of pressing End, and
 * a day-old ghost class must not nag students to join it.
 */
const LIVE_WINDOW_MS = 6 * 60 * 60 * 1000;

/**
 * Never cached, anywhere. This answer is "is a class happening right now", and
 * the iOS client goes through URLSession's on-disk cache by default — an
 * endpoint with no cache directives is exactly the kind it will happily serve
 * a heuristic stale copy of, which reads to a student as a class that will not
 * go away.
 */
const NO_STORE = { "Cache-Control": "no-store, no-cache, must-revalidate" };

/**
 * How long the phone should wait before asking anything again — this endpoint
 * and the ring poll both. See `lib/poll-cadence.ts` for why the cadence for
 * *both* pollers is decided here and rides on this one response.
 *
 * Never fatal: a cadence lookup that throws must not turn "is my class live?"
 * into an error. The client falls back to the intervals it used to hardcode.
 */
async function cadence(userId: string, isLive: boolean) {
  try {
    return await pollCadenceFor(userId, isLive);
  } catch {
    return FALLBACK_CADENCE;
  }
}

export async function GET(request: NextRequest) {
  return withHttpDb(async () => {
    try {
      const authResult = await requireAuth(request);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const cutoff = new Date(Date.now() - LIVE_WINDOW_MS);

      // Every teacher this user has ever had a class with.
      const teacherRows = await db
        .selectDistinct({ teacherId: sessions.teacherId })
        .from(bookings)
        .innerJoin(sessions, eq(bookings.sessionId, sessions.id))
        .where(eq(bookings.userId, ctx.userId));

      const teacherIds = teacherRows.map((r) => r.teacherId);
      if (teacherIds.length === 0)
        return NextResponse.json(
          { live: null, poll: await cadence(ctx.userId, false) },
          { headers: NO_STORE }
        );

      const liveSession = await db.query.sessions.findFirst({
        where: and(
          inArray(sessions.teacherId, teacherIds),
          eq(sessions.status, "IN_PROGRESS"),
          gt(sessions.actualStart, cutoff)
        ),
        orderBy: [desc(sessions.actualStart)],
      });

      if (!liveSession)
        return NextResponse.json(
          { live: null, poll: await cadence(ctx.userId, false) },
          { headers: NO_STORE }
        );

      const teacher = await db.query.users.findFirst({
        where: eq(users.id, liveSession.teacherId),
        columns: { name: true },
      });

      return NextResponse.json(
        {
          live: {
            sessionId: liveSession.id,
            teacherName: teacher?.name || "Your teacher",
            title: liveSession.title,
            startedAt: liveSession.actualStart?.toISOString() ?? null,
          },
          poll: await cadence(ctx.userId, true),
        },
        { headers: NO_STORE }
      );
    } catch (error) {
      return handleApiError(error);
    }
  });
}
