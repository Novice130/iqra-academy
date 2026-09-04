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
import { bookings, sessions, studentProfiles, users } from "@/db/schema";
import { requireAuth } from "@/lib/rbac";
import { handleApiError } from "@/lib/errors";
import { FALLBACK_CADENCE, pollCadenceFor } from "@/lib/poll-cadence";
import { and, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { LIVE_WINDOW_MS } from "@/lib/meeting-service";

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

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withHttpDb(async () => {
    try {
      const authResult = await requireAuth(request);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const cutoff = new Date(Date.now() - LIVE_WINDOW_MS);

      // Check student's profiles
      const studentProfilesList = await db
        .select({ id: studentProfiles.id })
        .from(studentProfiles)
        .where(eq(studentProfiles.userId, ctx.userId));
      const profileIds = studentProfilesList.map((p) => p.id);

      // Strategy 1: Check if this student (or their profiles) has a booking for an IN_PROGRESS session
      const bookingConditions = [eq(bookings.userId, ctx.userId)];
      if (profileIds.length > 0) {
        bookingConditions.push(inArray(bookings.studentProfileId, profileIds));
      }

      const directBookedSession = await db
        .select({
          id: sessions.id,
          title: sessions.title,
          teacherId: sessions.teacherId,
          actualStart: sessions.actualStart,
          scheduledStart: sessions.scheduledStart,
        })
        .from(bookings)
        .innerJoin(sessions, eq(bookings.sessionId, sessions.id))
        .where(
          and(
            or(...bookingConditions),
            eq(sessions.status, "IN_PROGRESS"),
            or(
              gt(sessions.actualStart, cutoff),
              and(isNull(sessions.actualStart), gt(sessions.scheduledStart, cutoff))
            )
          )
        )
        .orderBy(desc(sessions.actualStart), desc(sessions.scheduledStart))
        .limit(1);

      let liveSession: {
        id: string;
        title: string | null;
        teacherId: string;
        actualStart: Date | null;
      } | null = directBookedSession[0]
        ? {
            id: directBookedSession[0].id,
            title: directBookedSession[0].title,
            teacherId: directBookedSession[0].teacherId,
            actualStart: directBookedSession[0].actualStart || directBookedSession[0].scheduledStart,
          }
        : null;

      // Strategy 2: Check for public WEBINAR sessions in student's organization
      if (!liveSession && ctx.orgId) {
        const webinarFound = await db.query.sessions.findFirst({
          where: and(
            eq(sessions.orgId, ctx.orgId),
            eq(sessions.type, "WEBINAR"),
            eq(sessions.status, "IN_PROGRESS"),
            or(
              gt(sessions.actualStart, cutoff),
              and(isNull(sessions.actualStart), gt(sessions.scheduledStart, cutoff))
            )
          ),
          orderBy: [desc(sessions.actualStart), desc(sessions.scheduledStart)],
        });
        if (webinarFound) {
          liveSession = {
            id: webinarFound.id,
            title: webinarFound.title,
            teacherId: webinarFound.teacherId,
            actualStart: webinarFound.actualStart || webinarFound.scheduledStart,
          };
        }
      }

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
