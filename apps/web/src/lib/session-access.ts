/**
 * @fileoverview Shared Session Authorization & Tenant Isolation
 *
 * Provides canonical guards for session viewers, session hosts, assigned teachers,
 * and tenant-scoped role checks across all API routes and pages.
 *
 * Rules:
 * - Every tenant DB read/write must include `orgId`; foreign IDs return 404/403 before mutation.
 * - Only SUPER_ADMIN crosses org boundaries; ORG_ADMIN requires caller orgId === target orgId.
 * - Unrelated teachers from the same organization are NOT hosts of another teacher's class.
 * - Room-wide volume writes are restricted strictly to the assigned teacher (or SUPER_ADMIN support).
 * - Possession of a join link never grants authorization to an unbooked student.
 *
 * @module lib/session-access
 */

import { db } from "@/lib/db";
import { sessions, bookings, users, studentProfiles } from "@/db/schema";
import { eq, or } from "drizzle-orm";
import { NotFoundError, ForbiddenError, BusinessRuleError } from "@/lib/errors";
import { AuthContext } from "@/lib/rbac";

export function normalizeJoinCode(code: string): string {
  if (!code) return code;
  const trimmed = code.trim();
  const digitsOnly = trimmed.replace(/\D/g, "");
  if (digitsOnly.length === 12) {
    return `${digitsOnly.slice(0, 3)}-${digitsOnly.slice(3, 6)}-${digitsOnly.slice(6, 9)}-${digitsOnly.slice(9, 12)}`;
  }
  const clean = trimmed.replace(/[^a-zA-Z]/g, "").toLowerCase();
  if (clean.length === 12) {
    return `${clean.slice(0, 4)}-${clean.slice(4, 8)}-${clean.slice(8, 12)}`;
  }
  return trimmed;
}

export type SessionWithDetails = typeof sessions.$inferSelect & {
  bookings: Array<typeof bookings.$inferSelect>;
  teacher?: {
    id?: string;
    name: string | null;
    email: string;
  } | null;
};

/**
 * Loads a session by ID or joinCode.
 * If orgId is supplied and caller is not SUPER_ADMIN, ensures session.orgId === orgId.
 */
export async function loadOrgSession(
  orgId: string,
  sessionIdOrJoinCode: string,
  callerRole?: string
): Promise<SessionWithDetails> {
  const normalized = normalizeJoinCode(sessionIdOrJoinCode);
  const rawTrimmed = (sessionIdOrJoinCode || "").trim();
  const rawClean = rawTrimmed.replace(/[\s-]/g, "");

  const session = await db.query.sessions.findFirst({
    where: or(
      eq(sessions.id, normalized),
      eq(sessions.joinCode, normalized),
      eq(sessions.joinCode, rawTrimmed),
      eq(sessions.joinCode, rawClean),
      eq(sessions.id, rawTrimmed),
      eq(sessions.id, rawClean)
    ),
    with: {
      bookings: true,
      teacher: { columns: { id: true, name: true, email: true } },
    },
  });

  if (!session) {
    throw new NotFoundError("Session");
  }

  const isSuper = callerRole === "SUPER_ADMIN";
  if (!isSuper && orgId && session.orgId !== orgId) {
    // Fail closed: foreign org IDs return 404
    throw new NotFoundError("Session");
  }

  return session as unknown as SessionWithDetails;
}

/**
 * Asserts that caller is authorized to view / attend this session.
 * Allowed viewers:
 * 1. Assigned teacher
 * 2. Confirmed booked student account (userId in bookings)
 * 3. Same-org admin observer (or SUPER_ADMIN)
 * 4. Explicitly public webinar
 */
export function assertSessionViewer(
  session: SessionWithDetails,
  ctx: AuthContext
): { isTeacher: boolean; isStudent: boolean; isAdmin: boolean } {
  const isSuper = ctx.role === "SUPER_ADMIN";
  const isOrgAdmin = ctx.role === "ORG_ADMIN" && ctx.orgId === session.orgId;
  const isAdmin = isSuper || isOrgAdmin;

  // Organization boundary check
  if (!isSuper && ctx.orgId !== session.orgId) {
    throw new ForbiddenError("You cannot access sessions from another organization.");
  }

  const isTeacher = session.teacherId === ctx.userId;
  const isStudent = session.bookings.some(
    (b) => b.userId === ctx.userId && b.status !== "CANCELLED"
  );
  const isWebinar = session.type === "WEBINAR";

  if (!isTeacher && !isStudent && !isAdmin && !isWebinar) {
    throw new ForbiddenError("You are not booked or authorized for this session.");
  }

  return { isTeacher, isStudent, isAdmin };
}

/**
 * Asserts that caller is the session host.
 * Allowed hosts:
 * 1. The assigned teacher of this specific session
 * 2. Same-org ORG_ADMIN
 * 3. SUPER_ADMIN
 *
 * NOTE: Unrelated teachers from the same org are NOT hosts.
 */
export function assertSessionHost(
  session: SessionWithDetails,
  ctx: AuthContext
): { isOwningTeacher: boolean; isAdmin: boolean } {
  const isSuper = ctx.role === "SUPER_ADMIN";
  const isOrgAdmin = ctx.role === "ORG_ADMIN" && ctx.orgId === session.orgId;
  const isAdmin = isSuper || isOrgAdmin;
  const isOwningTeacher = session.teacherId === ctx.userId;

  if (!isOwningTeacher && !isAdmin) {
    throw new ForbiddenError("Only the session host or organization admin can manage this session.");
  }

  return { isOwningTeacher, isAdmin };
}

/**
 * Asserts that caller is strictly the assigned teacher (or SUPER_ADMIN support).
 * Used for room-wide gain / volume control that modifies what all participants hear.
 */
export function assertAssignedTeacher(
  session: SessionWithDetails,
  ctx: AuthContext
): void {
  const isSuper = ctx.role === "SUPER_ADMIN";
  const isAssigned = session.teacherId === ctx.userId;

  if (!isAssigned && !isSuper) {
    throw new ForbiddenError("Only the assigned teacher can control room-wide participant volume.");
  }
}

/**
 * Asserts that a target teacher exists, has TEACHER/ADMIN role, and belongs to target org.
 */
export async function assertTeacherInOrg(
  teacherId: string,
  orgId: string,
  isSuper: boolean = false
): Promise<{ id: string; name: string; email: string; orgId: string; role: string }> {
  const teacher = await db.query.users.findFirst({
    where: eq(users.id, teacherId),
    columns: { id: true, name: true, email: true, orgId: true, role: true, deletedAt: true },
  });

  if (!teacher || teacher.deletedAt) {
    throw new NotFoundError("Teacher");
  }

  if (!isSuper && teacher.orgId !== orgId) {
    throw new ForbiddenError("Target teacher does not belong to your organization.");
  }

  if (!["TEACHER", "ORG_ADMIN", "SUPER_ADMIN"].includes(teacher.role)) {
    throw new BusinessRuleError("Specified user is not a teacher.");
  }

  return teacher;
}

/**
 * Asserts that a student profile exists and belongs to target org.
 */
export async function assertProfileInOrg(
  studentProfileId: string,
  orgId: string,
  isSuper: boolean = false
): Promise<{ id: string; name: string; userId: string; orgId: string; track: "QAIDAH" | "QURAN_READING" | "HIFZ" }> {
  const profile = await db.query.studentProfiles.findFirst({
    where: eq(studentProfiles.id, studentProfileId),
    columns: { id: true, name: true, userId: true, orgId: true, track: true },
  });

  if (!profile) {
    throw new NotFoundError("Student profile");
  }

  if (!isSuper && profile.orgId !== orgId) {
    throw new ForbiddenError("Target student profile does not belong to your organization.");
  }

  return profile as any;
}
