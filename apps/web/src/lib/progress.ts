/**
 * @fileoverview Teacher-recorded lesson progress.
 *
 * WHY THIS EXISTS: `progress_records` is the only source for the family's
 * progress page and the admin student page, but nothing wrote to it — so both
 * were always empty. Progress follows the schema's approval pattern: families
 * never self-report; the teacher who teaches the child (or an admin of the
 * same org) records it.
 *
 * One row per (student profile, lesson) — the unique index enforces it — so
 * recording a lesson again updates that row rather than adding a second one.
 * The row then reflects the latest assessment of that lesson.
 *
 * @module lib/progress
 */

import { db } from "@/lib/db";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import {
  bookings,
  defaultWeeklySlots,
  lessonContent,
  progressRecords,
  sessions,
  users,
} from "@/db/schema";
import { assertProfileInOrg } from "@/lib/session-access";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "@/lib/errors";
import type { AuthContext } from "@/lib/rbac";

/**
 * A teacher may take back their own entry for this long. After that it is part
 * of the child's record the family has already seen; an admin can still remove
 * it.
 */
export const PROGRESS_DELETE_WINDOW_MS = 24 * 60 * 60 * 1000;

type Caller = Pick<AuthContext, "userId" | "orgId" | "role">;

export function isOrgAdminRole(role: string): boolean {
  return role === "ORG_ADMIN" || role === "SUPER_ADMIN";
}

/**
 * Whether this teacher teaches this child: a non-cancelled booking for the
 * profile on one of the teacher's sessions, or an active default weekly slot.
 * Same rule as the teacher's student list — a teacher in the same org who has
 * never had the child in class may not write the child's record.
 */
export async function teacherTeachesProfile(teacherId: string, studentProfileId: string): Promise<boolean> {
  const [slot] = await db
    .select({ id: defaultWeeklySlots.id })
    .from(defaultWeeklySlots)
    .where(
      and(
        eq(defaultWeeklySlots.teacherId, teacherId),
        eq(defaultWeeklySlots.studentProfileId, studentProfileId),
        eq(defaultWeeklySlots.isActive, true)
      )
    )
    .limit(1);
  if (slot) return true;

  const [booked] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .innerJoin(sessions, eq(sessions.id, bookings.sessionId))
    .where(
      and(
        eq(bookings.studentProfileId, studentProfileId),
        ne(bookings.status, "CANCELLED"),
        eq(sessions.teacherId, teacherId)
      )
    )
    .limit(1);
  return Boolean(booked);
}

/**
 * Loads the profile and checks the caller may record progress for it.
 * Org first (foreign ids fail closed), then the teaching relationship.
 */
export async function assertCanRecordProgress(caller: Caller, studentProfileId: string) {
  const isSuper = caller.role === "SUPER_ADMIN";
  const profile = await assertProfileInOrg(studentProfileId, caller.orgId, isSuper);
  if (isOrgAdminRole(caller.role)) return profile;
  if (!(await teacherTeachesProfile(caller.userId, studentProfileId))) {
    throw new ForbiddenError("You can only record progress for students you teach.");
  }
  return profile;
}

/** The lesson must be in the child's org and track, or the % on the progress page lies. */
export async function assertLessonForProfile(lessonId: string, profile: { orgId: string; track: string }) {
  const lesson = await db.query.lessonContent.findFirst({
    where: and(eq(lessonContent.id, lessonId), eq(lessonContent.orgId, profile.orgId)),
    columns: { id: true, title: true, track: true },
  });
  if (!lesson) throw new NotFoundError("Lesson");
  if (lesson.track !== profile.track) {
    throw new BusinessRuleError("That lesson belongs to a different track than this student's.");
  }
  return lesson;
}

/**
 * A linked session must be one this child was booked on and, for a teacher,
 * one they taught — otherwise the entry would claim a class that never
 * involved them.
 */
export async function assertSessionForProfile(caller: Caller, sessionId: string, profile: { id: string; orgId: string }) {
  const [row] = await db
    .select({ id: sessions.id, teacherId: sessions.teacherId })
    .from(sessions)
    .innerJoin(bookings, eq(bookings.sessionId, sessions.id))
    .where(
      and(
        eq(sessions.id, sessionId),
        eq(sessions.orgId, profile.orgId),
        eq(bookings.studentProfileId, profile.id),
        ne(bookings.status, "CANCELLED")
      )
    )
    .limit(1);
  if (!row) throw new NotFoundError("Session");
  if (!isOrgAdminRole(caller.role) && row.teacherId !== caller.userId) {
    throw new ForbiddenError("You can only link a class you taught.");
  }
  return row;
}

/** Active lessons for a track in an org, in curriculum order. */
export async function listLessonsForTrack(orgId: string, track: (typeof lessonContent.track.enumValues)[number]) {
  return db
    .select({ id: lessonContent.id, title: lessonContent.title, sortOrder: lessonContent.sortOrder })
    .from(lessonContent)
    .where(and(eq(lessonContent.orgId, orgId), eq(lessonContent.track, track), eq(lessonContent.isActive, true)))
    .orderBy(lessonContent.sortOrder);
}

/** Classes the caller can link an entry to: the child's recent started or finished classes. */
export async function listLinkableSessions(caller: Caller, studentProfileId: string, limit = 10) {
  const conditions = [
    eq(bookings.studentProfileId, studentProfileId),
    ne(bookings.status, "CANCELLED"),
    inArray(sessions.status, ["IN_PROGRESS", "COMPLETED"]),
  ];
  if (!isOrgAdminRole(caller.role)) conditions.push(eq(sessions.teacherId, caller.userId));
  return db
    .selectDistinct({ id: sessions.id, scheduledStart: sessions.scheduledStart })
    .from(sessions)
    .innerJoin(bookings, eq(bookings.sessionId, sessions.id))
    .where(and(...conditions))
    .orderBy(desc(sessions.scheduledStart))
    .limit(limit);
}

export interface ProgressEntry {
  id: string;
  lessonId: string;
  lessonTitle: string | null;
  sessionId: string | null;
  isCompleted: boolean;
  score: number | null;
  teacherNotes: string | null;
  recordedById: string | null;
  recordedByName: string | null;
  updatedAt: string;
}

/** Latest entries for a profile, newest first, as plain JSON for client components. */
export async function listProgressEntries(studentProfileId: string, limit = 30): Promise<ProgressEntry[]> {
  const rows = await db
    .select({
      id: progressRecords.id,
      lessonId: progressRecords.lessonId,
      lessonTitle: lessonContent.title,
      sessionId: progressRecords.sessionId,
      isCompleted: progressRecords.isCompleted,
      score: progressRecords.score,
      teacherNotes: progressRecords.teacherNotes,
      recordedById: progressRecords.teacherApprovedBy,
      recordedByName: users.name,
      updatedAt: progressRecords.updatedAt,
    })
    .from(progressRecords)
    .leftJoin(lessonContent, eq(lessonContent.id, progressRecords.lessonId))
    .leftJoin(users, eq(users.id, progressRecords.teacherApprovedBy))
    .where(eq(progressRecords.studentProfileId, studentProfileId))
    .orderBy(desc(progressRecords.updatedAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
}

/** Whether `caller` may delete an entry: admins any in-org entry, teachers their own within the window. */
export function canDeleteEntry(
  caller: Caller,
  entry: { recordedById: string | null; updatedAt: Date | string },
  now = Date.now()
): boolean {
  if (isOrgAdminRole(caller.role)) return true;
  if (entry.recordedById !== caller.userId) return false;
  return now - new Date(entry.updatedAt).getTime() <= PROGRESS_DELETE_WINDOW_MS;
}
