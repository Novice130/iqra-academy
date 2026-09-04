/**
 * @fileoverview Canonical Meeting Lifecycle Service
 *
 * Coordinates meeting lifecycle, start target resolution, scheduled occurrence starts,
 * ad-hoc instant meeting creation, and direct call convergence without creating competing rooms.
 *
 * @module lib/meeting-service
 */

import { db } from "@/lib/db";
import {
  sessions,
  bookings,
  notifications,
  users,
  callInvites,
  sessionAttendance,
  studentProfiles,
} from "@/db/schema";
import {
  EARLY_JOIN_MS,
  LATE_JOIN_MS,
  LIVE_WINDOW_MS,
  SIBLING_WINDOW_MS,
} from "@/lib/class-room";
import { generateLiveKitToken, generateRoomName } from "@/lib/livekit";
import { sendCallPush, sendPushToUsers } from "@/lib/fcm";
import { sendWebPushToUsers } from "@/lib/webpush";
import { createId } from "@paralleldrive/cuid2";
import { and, asc, desc, eq, gt, inArray, lt, ne, or } from "drizzle-orm";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { insertSchedulingEvent } from "@/lib/realtime/outbox";
import { drainOutbox } from "@/lib/realtime/outbox-publisher";
import { afterResponse } from "@/lib/after-response";

export { EARLY_JOIN_MS, LATE_JOIN_MS, LIVE_WINDOW_MS, SIBLING_WINDOW_MS };

/** Time windows around now for scheduled class resolution.
 * Aliased (not copied) from lib/class-room.ts so the resolver and the join
 * window cannot drift: at any instant the button and the resolver must agree
 * on whether a class is "due", or teacher and student land in different rooms.
 * (The client-side mirror in lib/class-action.ts is value-checked by test.)
 */
export const SCHEDULED_BEFORE_MS = EARLY_JOIN_MS; // T-60
export const SCHEDULED_AFTER_MS = LATE_JOIN_MS; // T+180

export {
  getMeetingLifecycleState,
  getClassActionState,
  formatClassDuration,
  formatClassCountdown,
  type MeetingLifecycleState,
  type ClassActionState,
  type ClassActionSession,
  type ClassActionViewer,
} from "@/lib/class-action";

/**
 * Checks if the assigned teacher is actively in the room.
 */
export async function isTeacherPresent(sessionId: string): Promise<boolean> {
  const teacherRecord = await db.query.sessionAttendance.findFirst({
    where: and(
      eq(sessionAttendance.sessionId, sessionId),
      eq(sessionAttendance.role, "TEACHER"),
      gt(sessionAttendance.joinedAt, new Date(Date.now() - LIVE_WINDOW_MS))
    ),
    orderBy: [desc(sessionAttendance.joinedAt)],
  });
  return !!teacherRecord && teacherRecord.leftAt === null;
}

/**
 * Resolves whether a teacher has a live running class or a scheduled occurrence due now.
 * Used to converge ad-hoc and direct-call actions into the same room.
 */
export async function resolveStartTarget(
  teacherId: string,
  orgId: string,
  now: Date = new Date()
): Promise<
  | { kind: "running"; session: typeof sessions.$inferSelect }
  | { kind: "scheduled"; session: typeof sessions.$inferSelect }
  | { kind: "instant" }
> {
  const nowMs = now.getTime();

  // 1. Live class running
  const running = await db.query.sessions.findFirst({
    where: and(
      eq(sessions.teacherId, teacherId),
      eq(sessions.orgId, orgId),
      eq(sessions.status, "IN_PROGRESS"),
      gt(sessions.actualStart, new Date(nowMs - LIVE_WINDOW_MS))
    ),
    orderBy: [desc(sessions.actualStart)],
  });
  if (running) {
    return { kind: "running", session: running };
  }

  // 2. Due scheduled class on calendar
  const scheduled = await db.query.sessions.findFirst({
    where: and(
      eq(sessions.teacherId, teacherId),
      eq(sessions.orgId, orgId),
      eq(sessions.status, "SCHEDULED"),
      gt(sessions.scheduledStart, new Date(nowMs - SCHEDULED_AFTER_MS)),
      lt(sessions.scheduledStart, new Date(nowMs + SCHEDULED_BEFORE_MS))
    ),
    orderBy: [asc(sessions.scheduledStart)],
  });
  if (scheduled) {
    return { kind: "scheduled", session: scheduled };
  }

  return { kind: "instant" };
}

/**
 * Starts a scheduled occurrence. Called when the assigned teacher connects.
 */
export async function startScheduledOccurrence(params: {
  sessionId: string;
  teacherId: string;
  orgId: string;
}) {
  const { sessionId, teacherId, orgId } = params;
  const now = new Date();

  const session = await db.query.sessions.findFirst({
    where: and(eq(sessions.id, sessionId), eq(sessions.orgId, orgId)),
  });
  if (!session) throw new NotFoundError("Session");
  if (session.teacherId !== teacherId) {
    throw new ForbiddenError("Only the assigned teacher can start this scheduled class.");
  }

  const roomName = session.videoRoomName || generateRoomName(sessionId);

  if (session.status !== "IN_PROGRESS") {
    await db.transaction(async (tx) => {
      await tx
        .update(sessions)
        .set({
          status: "IN_PROGRESS",
          actualStart: session.actualStart ?? now,
          videoRoomName: roomName,
        })
        .where(eq(sessions.id, sessionId));

      await insertSchedulingEvent(tx, {
        orgId,
        teacherId,
        actorId: teacherId,
        type: "class.live",
        aggregateType: "session",
        aggregateId: sessionId,
      });
    });

    afterResponse(drainOutbox({ orgId }).catch(() => {}));
  }

  // Notify booked students who are not yet in the room
  const alreadyBooked = await db.query.bookings.findMany({
    where: and(eq(bookings.sessionId, sessionId), ne(bookings.status, "CANCELLED")),
    columns: { userId: true },
  });
  const bookedUserIds = [...new Set(alreadyBooked.map((b) => b.userId))].filter(
    (id) => id !== teacherId
  );

  if (bookedUserIds.length > 0) {
    const teacher = await db.query.users.findFirst({
      where: eq(users.id, teacherId),
      columns: { name: true },
    });
    const teacherName = teacher?.name || "Your teacher";
    const message = `${teacherName} started the class. Join now.`;

    await db.insert(notifications).values(
      bookedUserIds.map((userId) => ({
        id: createId(),
        orgId,
        userId,
        type: "MEETING_STARTED" as const,
        sessionId,
        message,
      }))
    );

    await sendPushToUsers(bookedUserIds, {
      title: "Your class has started",
      body: message,
      path: `/dashboard/session/${sessionId}`,
      sessionId,
    });
  }

  return { sessionId, roomName, startedAt: now };
}

/**
 * Creates an ad-hoc instant meeting session.
 */
export async function createInstantMeeting(params: {
  orgId: string;
  teacherId: string;
  title?: string;
  studentProfileIds?: string[];
}) {
  const { orgId, teacherId, title, studentProfileIds = [] } = params;
  const now = new Date();
  const end = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour default

  const teacher = await db.query.users.findFirst({
    where: eq(users.id, teacherId),
  });
  if (!teacher) throw new NotFoundError("Teacher");

  const sessionId = createId();
  const roomName = generateRoomName(sessionId);
  const sessionTitle = title || `Instant Meeting with ${teacher.name}`;

  let addedStudents: { studentProfileId: string; userId: string; name: string }[] = [];
  let profiles: any[] = [];
  if (studentProfileIds.length > 0) {
    profiles = await db.query.studentProfiles.findMany({
      where: and(
        inArray(studentProfiles.id, studentProfileIds),
        eq(studentProfiles.orgId, orgId)
      ),
    });
  }

  await db.transaction(async (tx) => {
    await tx.insert(sessions).values({
      id: sessionId,
      orgId,
      teacherId,
      type: "INDIVIDUAL",
      origin: "INSTANT",
      status: "IN_PROGRESS",
      title: sessionTitle,
      scheduledStart: now,
      scheduledEnd: end,
      actualStart: now,
      consumesQuota: false,
      videoRoomName: roomName,
    });

    await insertSchedulingEvent(tx, {
      orgId,
      teacherId,
      actorId: teacherId,
      type: "class.live",
      aggregateType: "session",
      aggregateId: sessionId,
    });

    if (profiles.length > 0) {
      await tx.insert(bookings).values(
        profiles.map((p) => ({
          id: createId(),
          orgId,
          userId: p.userId,
          studentProfileId: p.id,
          sessionId,
          status: "CONFIRMED" as const,
        }))
      );
      for (const p of profiles) {
        await insertSchedulingEvent(tx, {
          orgId,
          teacherId,
          actorId: teacherId,
          type: "booking.created",
          aggregateType: "booking",
          aggregateId: p.id,
        });
      }
    }
  });

  afterResponse(drainOutbox({ orgId }).catch(() => {}));

  if (profiles.length > 0) {
    addedStudents = profiles.map((p) => ({
      studentProfileId: p.id,
      userId: p.userId,
      name: p.name,
    }));

      const message = `${teacher.name} started the class. Join now.`;
      const studentUserIds = [...new Set(profiles.map((p) => p.userId))];

      await db.insert(notifications).values(
        studentUserIds.map((userId) => ({
          id: createId(),
          orgId,
          userId,
          type: "MEETING_STARTED" as const,
          sessionId,
          message,
        }))
      );

      await sendPushToUsers(studentUserIds, {
        title: "Your class has started",
        body: message,
        path: `/dashboard/session/${sessionId}`,
        sessionId,
      });
    }

  const token = await generateLiveKitToken({
    roomName,
    userName: teacher.name,
    userEmail: teacher.email,
    isModerator: true,
  });

  return {
    sessionId,
    roomName,
    token,
    title: sessionTitle,
    joinUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://novicetutor.com"}/dashboard/session/${sessionId}`,
    addedStudents,
  };
}

/**
 * Rings a participant into a canonical room.
 * Prevents direct-call from creating a competing rogue room when a scheduled class is due.
 */
export async function ringParticipantIntoCanonicalRoom(params: {
  orgId: string;
  teacherId: string;
  studentProfileId: string;
  existingSessionId?: string;
  isSuperAdmin?: boolean;
}) {
  const { orgId, teacherId, studentProfileId, existingSessionId, isSuperAdmin } = params;
  const now = new Date();

  const [teacher, studentProfile] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, teacherId) }),
    db.query.studentProfiles.findFirst({ where: eq(studentProfiles.id, studentProfileId) }),
  ]);
  if (!teacher) throw new NotFoundError("Teacher");
  if (!studentProfile) throw new NotFoundError("Student");

  if (!isSuperAdmin && studentProfile.orgId !== orgId) {
    throw new ForbiddenError("You can only call students in your own organization.");
  }
  const sessionOrgId = studentProfile.orgId;

  let sessionId = existingSessionId;
  let roomName: string;
  let token: string | null = null;

  if (sessionId) {
    const existingSession = await db.query.sessions.findFirst({
      where: eq(sessions.id, sessionId),
    });
    if (!existingSession) throw new NotFoundError("Session");
    if (existingSession.teacherId !== teacherId && !isSuperAdmin) {
      throw new ForbiddenError("Not your session.");
    }

    roomName = existingSession.videoRoomName || generateRoomName(sessionId);
    if (!existingSession.videoRoomName) {
      await db
        .update(sessions)
        .set({ videoRoomName: roomName })
        .where(eq(sessions.id, sessionId));
    }
  } else {
    // Check if there is an active running OR due scheduled class for this teacher & student!
    const dueClassForStudent = await db
      .select({ session: sessions })
      .from(sessions)
      .innerJoin(bookings, eq(bookings.sessionId, sessions.id))
      .where(
        and(
          eq(sessions.teacherId, teacherId),
          eq(sessions.status, "SCHEDULED"),
          or(
            eq(bookings.studentProfileId, studentProfile.id),
            eq(bookings.userId, studentProfile.userId)
          ),
          ne(bookings.status, "CANCELLED"),
          gt(sessions.scheduledStart, new Date(now.getTime() - SCHEDULED_AFTER_MS)),
          lt(sessions.scheduledStart, new Date(now.getTime() + SCHEDULED_BEFORE_MS))
        )
      )
      .orderBy(asc(sessions.scheduledStart))
      .limit(1);

    if (dueClassForStudent[0]?.session) {
      // Re-use due scheduled class!
      const dueSession = dueClassForStudent[0].session;
      sessionId = dueSession.id;
      roomName = dueSession.videoRoomName || generateRoomName(sessionId);
      await startScheduledOccurrence({
        sessionId,
        teacherId,
        orgId: dueSession.orgId,
      });
    } else {
      // Check if teacher is in an already-running class
      const target = await resolveStartTarget(teacherId, sessionOrgId, now);
      if (target.kind === "running") {
        sessionId = target.session.id;
        roomName = target.session.videoRoomName || generateRoomName(sessionId);
      } else {
        // Create an ad-hoc instant meeting
        const instant = await createInstantMeeting({
          orgId: sessionOrgId,
          teacherId,
          studentProfileIds: [studentProfile.id],
        });
        sessionId = instant.sessionId;
        roomName = instant.roomName;
        token = instant.token;
      }
    }
  }

  // Ensure booking exists so student join isn't rejected
  const existingBooking = await db.query.bookings.findFirst({
    where: and(
      eq(bookings.sessionId, sessionId!),
      or(
        eq(bookings.studentProfileId, studentProfile.id),
        eq(bookings.userId, studentProfile.userId)
      )
    ),
  });

  if (!existingBooking) {
    await db.insert(bookings).values({
      id: createId(),
      orgId: sessionOrgId,
      userId: studentProfile.userId,
      studentProfileId: studentProfile.id,
      sessionId: sessionId!,
      status: "CONFIRMED",
    });
  }

  const callId = createId();
  await db.insert(callInvites).values({
    id: callId,
    orgId: sessionOrgId,
    sessionId: sessionId!,
    callerId: teacherId,
    calleeId: studentProfile.userId,
    status: "RINGING",
  });

  await sendCallPush([studentProfile.userId], {
    callId,
    sessionId: sessionId!,
    callerName: teacher.name,
  });

  await sendWebPushToUsers([studentProfile.userId]);

  return {
    callId,
    sessionId: sessionId!,
    roomName: roomName!,
    token,
    joinUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://novicetutor.com"}/dashboard/session/${sessionId}`,
  };
}
