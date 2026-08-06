/**
 * @fileoverview Teacher Instant Meeting API
 *
 * RBAC: TEACHER, ORG_ADMIN, SUPER_ADMIN
 * POST /api/teachers/instant-meeting — puts the teacher in a live room now.
 *
 * "Instant" does NOT mean "new". A teacher whose class is on the calendar and
 * who presses this button wants to be in *that* class — minting a fresh
 * session row instead is how the students end up in one room and the teacher
 * in another, since every student's dashboard links at the scheduled row.
 *
 * So the order is: a class already running → resume it; a class scheduled
 * around now → start that one; nothing at all → create an ad-hoc session.
 */

import { NextRequest, NextResponse } from "next/server";
import { db, withDb } from "@/lib/db";
import { bookings, notifications, sessions, studentProfiles, users } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { handleApiError } from "@/lib/errors";
import { generateLiveKitToken, generateRoomName } from "@/lib/livekit";
import { and, asc, desc, eq, gt, inArray, lt } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";

/** A class already running belongs to today, not to yesterday's ghost. */
const LIVE_WINDOW_MS = 6 * 60 * 60 * 1000;

/**
 * How far around "now" a scheduled class counts as the one being started.
 * Generous on both sides on purpose: teachers open the room before the hour,
 * and a class that started late is still that class.
 */
const SCHEDULED_BEFORE_MS = 60 * 60 * 1000;
const SCHEDULED_AFTER_MS = 2 * 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  return withDb(async () => {
    try {
      const authResult = await requireRole(request, ["TEACHER", "ORG_ADMIN", "SUPER_ADMIN"]);
      if (authResult instanceof NextResponse) return authResult;
      const ctx = authResult;

      const body = await request.json().catch(() => ({}));
      const studentProfileIds: string[] = Array.isArray(body?.studentProfileIds)
        ? body.studentProfileIds
        : [];

      const teacher = await db.query.users.findFirst({
        where: eq(users.id, ctx.userId),
      });

      if (!teacher) {
        throw new Error("Teacher not found");
      }

      const now = new Date();
      const end = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour default

      // 1. Already teaching? That's the room.
      const running = await db.query.sessions.findFirst({
        where: and(
          eq(sessions.teacherId, ctx.userId),
          eq(sessions.status, "IN_PROGRESS"),
          gt(sessions.actualStart, new Date(now.getTime() - LIVE_WINDOW_MS))
        ),
        orderBy: [desc(sessions.actualStart)],
      });

      // 2. Otherwise the class on the calendar around now, so the students'
      //    own links land in the same room. Earliest first: if two are due,
      //    the one that should already have begun is the one being started.
      const scheduled =
        running ??
        (await db.query.sessions.findFirst({
          where: and(
            eq(sessions.teacherId, ctx.userId),
            eq(sessions.status, "SCHEDULED"),
            gt(sessions.scheduledStart, new Date(now.getTime() - SCHEDULED_AFTER_MS)),
            lt(sessions.scheduledStart, new Date(now.getTime() + SCHEDULED_BEFORE_MS))
          ),
          orderBy: [asc(sessions.scheduledStart)],
        }));

      const existing = running ?? scheduled;
      const sessionId = existing?.id ?? createId();
      const roomName = existing?.videoRoomName || generateRoomName(sessionId);

      if (existing) {
        // Starting a scheduled class is what makes it live; a running one is
        // left exactly as it is so re-entering doesn't reset actualStart.
        if (existing.status !== "IN_PROGRESS") {
          await db
            .update(sessions)
            .set({ status: "IN_PROGRESS", actualStart: existing.actualStart ?? now, videoRoomName: roomName })
            .where(eq(sessions.id, existing.id));
        }
      } else {
        // 3. Nothing on the calendar — a genuine ad-hoc meeting.
        await db.insert(sessions).values({
          id: sessionId,
          orgId: ctx.orgId || "seed_org_iqra_academy", // Fallback for safety
          teacherId: ctx.userId,
          type: "INDIVIDUAL", // Instant meetings are handled dynamically, INDIVIDUAL is fine as a placeholder
          status: "IN_PROGRESS",
          title: `Instant Meeting with ${teacher.name}`,
          scheduledStart: now,
          scheduledEnd: end,
          actualStart: now,
          consumesQuota: false, // Ad-hoc meetings don't consume quota automatically
          videoRoomName: roomName,
        });
      }

      // Whoever is already booked on this session (the normal case now that
      // starting a meeting resumes the scheduled class) plus anyone named
      // explicitly by a caller that still passes ids.
      const alreadyBooked = await db.query.bookings.findMany({
        where: eq(bookings.sessionId, sessionId),
        columns: { userId: true },
      });
      const bookedUserIds = new Set(alreadyBooked.map((b) => b.userId));

      let addedStudents: { studentProfileId: string; userId: string; name: string }[] = [];
      if (studentProfileIds.length > 0) {
        const profiles = await db.query.studentProfiles.findMany({
          where: inArray(studentProfiles.id, studentProfileIds),
        });
        // Resuming a class means the bookings are already there — inserting
        // them again would double-book everyone on the roster.
        const fresh = profiles.filter((p) => !bookedUserIds.has(p.userId));

        if (fresh.length > 0) {
          await db.insert(bookings).values(
            fresh.map((p) => ({
              id: createId(),
              orgId: ctx.orgId || "seed_org_iqra_academy",
              userId: p.userId,
              studentProfileId: p.id,
              sessionId,
              status: "CONFIRMED" as const,
            }))
          );
          fresh.forEach((p) => bookedUserIds.add(p.userId));
          addedStudents = fresh.map((p) => ({ studentProfileId: p.id, userId: p.userId, name: p.name }));
        }
      }

      // Tell everyone on the session it has begun. Students sitting in the
      // lobby join on their own poll, but the ones who haven't opened the page
      // need to hear about it — this is what "the teacher started" looks like
      // from the dashboard.
      if (bookedUserIds.size > 0 && running?.id !== sessionId) {
        await db.insert(notifications).values(
          [...bookedUserIds].map((userId) => ({
            id: createId(),
            orgId: ctx.orgId || "seed_org_iqra_academy",
            userId,
            type: "MEETING_STARTED" as const,
            sessionId,
            message: `${teacher.name} started the class. Join now.`,
          }))
        );
      }

      // Generate token for the teacher
      const token = await generateLiveKitToken({
        roomName,
        userName: teacher.name,
        userEmail: teacher.email,
        isModerator: true,
      });

      return NextResponse.json({
        success: true,
        sessionId,
        roomName,
        token,
        joinUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://novicetutor.com"}/dashboard/session/${sessionId}`,
        addedStudents,
        // What the caller actually got: the class it resumed, or a new room.
        resumed: existing ? (running ? "running" : "scheduled") : null,
        title: existing?.title ?? `Instant Meeting with ${teacher.name}`,
      });
    } catch (error) {
      return handleApiError(error);
    }
  });
}
