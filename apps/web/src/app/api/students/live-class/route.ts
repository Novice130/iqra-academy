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
import { db, withDb } from "@/lib/db";
import { bookings, sessions, users } from "@/db/schema";
import { requireAuth } from "@/lib/rbac";
import { handleApiError } from "@/lib/errors";
import { and, desc, eq, gt, inArray } from "drizzle-orm";

/**
 * Sessions are only surfaced for a few hours after they start. Rooms are
 * left IN_PROGRESS when a teacher closes the tab instead of pressing End, and
 * a day-old ghost class must not nag students to join it.
 */
const LIVE_WINDOW_MS = 6 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  return withDb(async () => {
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
      if (teacherIds.length === 0) return NextResponse.json({ live: null });

      const liveSession = await db.query.sessions.findFirst({
        where: and(
          inArray(sessions.teacherId, teacherIds),
          eq(sessions.status, "IN_PROGRESS"),
          gt(sessions.actualStart, cutoff)
        ),
        orderBy: [desc(sessions.actualStart)],
      });

      if (!liveSession) return NextResponse.json({ live: null });

      const teacher = await db.query.users.findFirst({
        where: eq(users.id, liveSession.teacherId),
        columns: { name: true },
      });

      return NextResponse.json({
        live: {
          sessionId: liveSession.id,
          teacherName: teacher?.name || "Your teacher",
          title: liveSession.title,
          startedAt: liveSession.actualStart?.toISOString() ?? null,
        },
      });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
